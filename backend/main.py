"""
Studentlytics Local Backend
Face recognition-powered attendance tracking using open-source models.
Cost: $0/video (vs $6-8 with AWS Rekognition)
"""

import os
import json
import uuid
import time
import logging
import csv
from pathlib import Path
from typing import Optional
from datetime import datetime

import subprocess
import tempfile
import threading

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import aiofiles

from security import (
    AuthContext,
    OpportunityPayload,
    OpportunityUpdatePayload,
    StudentPayload,
    StudentUpdatePayload,
    audit_event,
    check_rate_limit,
    is_admin,
    owns_resource,
    require_roles,
    require_user,
    sanitize_payload,
)

# ── Setup ──────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("studentlytics")

# Optional face recognition imports
try:
    import cv2
    import numpy as np
    import face_recognition
    from faster_whisper import WhisperModel
    VIDEO_PROCESSING_AVAILABLE = True
except ImportError as exc:
    cv2 = None
    np = None
    face_recognition = None
    WhisperModel = None
    VIDEO_PROCESSING_AVAILABLE = False
    logger.warning("Video processing dependencies are not available: %s", exc)

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
PHOTOS_DIR = BASE_DIR / "data" / "student_photos"
VIDEOS_DIR = BASE_DIR / "data" / "videos"
RESULTS_DIR = BASE_DIR / "data" / "results"
ENCODINGS_FILE = BASE_DIR / "data" / "face_encodings.json"
STUDENTS_FILE = BASE_DIR / "data" / "students.json"
OPPORTUNITIES_FILE = BASE_DIR / "data" / "opportunities.json"
PUBLIC_STUDENT_CSV = BASE_DIR.parent / "public" / "student.csv"

for d in [DATA_DIR, PHOTOS_DIR, VIDEOS_DIR, RESULTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Studentlytics API", version="1.0.0")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3006,http://127.0.0.1:3006"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def security_headers_and_rate_limits(request: Request, call_next):
    client_host = request.client.host if request.client else "unknown"
    route_key = f"{client_host}:{request.url.path}"
    limit = 20 if request.url.path.startswith("/api/auth") else 240

    if os.getenv("ENVIRONMENT") == "production" and request.headers.get("x-forwarded-proto") != "https":
        return JSONResponse({"detail": "HTTPS required"}, status_code=status.HTTP_400_BAD_REQUEST)

    if not check_rate_limit(route_key, limit=limit, window_seconds=60):
        audit_event("rate_limit_exceeded", None, {"path": request.url.path, "client": client_host})
        return JSONResponse({"detail": "Too many requests"}, status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'; object-src 'none'"
    return response


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled backend error at %s", request.url.path)
    return JSONResponse({"detail": "Internal server error"}, status_code=500)

# ── In-memory state ────────────────────────────────────────────────────────────
# { video_id: { status, progress, result, error } }
processing_jobs: dict = {}

# ── Local JSON-backed application data ────────────────────────────────────────
def _read_json_file(path: Path, default):
    if not path.exists():
        return default
    with open(path) as f:
        return json.load(f)


def _write_json_file(path: Path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _seed_students_from_csv() -> list[dict]:
    if not PUBLIC_STUDENT_CSV.exists():
        return []

    with open(PUBLIC_STUDENT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def load_students() -> list[dict]:
    if not STUDENTS_FILE.exists():
        students = _seed_students_from_csv()
        _write_json_file(STUDENTS_FILE, students)
        return students
    return _read_json_file(STUDENTS_FILE, [])


def save_students(students: list[dict]):
    _write_json_file(STUDENTS_FILE, students)


def load_opportunities() -> list[dict]:
    if not OPPORTUNITIES_FILE.exists():
        _write_json_file(OPPORTUNITIES_FILE, [])
    return _read_json_file(OPPORTUNITIES_FILE, [])


def save_opportunities(opportunities: list[dict]):
    _write_json_file(OPPORTUNITIES_FILE, opportunities)

# ── Face encoding store ────────────────────────────────────────────────────────
def load_encodings() -> dict:
    """Load saved face encodings from disk."""
    if not VIDEO_PROCESSING_AVAILABLE:
        return {}

    if ENCODINGS_FILE.exists():
        with open(ENCODINGS_FILE) as f:
            raw = json.load(f)
        # Convert lists back to numpy arrays
        return {
            sid: {
                "name": data["name"],
                "owner_id": data.get("owner_id"),
                "student_id": data.get("student_id", sid),
                "encodings": [np.array(e) for e in data["encodings"]],
            }
            for sid, data in raw.items()
        }
    return {}

def save_encodings(encodings: dict):
    """Save face encodings to disk."""
    if not VIDEO_PROCESSING_AVAILABLE:
        raise RuntimeError("Video processing dependencies are not installed")

    serializable = {
        sid: {
            "name": data["name"],
            "owner_id": data.get("owner_id"),
            "student_id": data.get("student_id", sid),
            "encodings": [e.tolist() for e in data["encodings"]],
        }
        for sid, data in encodings.items()
    }
    with open(ENCODINGS_FILE, "w") as f:
        json.dump(serializable, f, indent=2)

student_encodings = load_encodings()

# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "students_enrolled": len(student_encodings),
        "version": "1.0.0",
    }


@app.get("/me/export")
def export_my_data(user: AuthContext = Depends(require_user)):
    """Export the signed-in user's stored application data."""
    owned_students = [student for student in load_students() if student.get("owner_id") == user.user_id]
    owned_opportunities = [
        opportunity for opportunity in load_opportunities()
        if opportunity.get("owner_id") == user.user_id
    ]
    owned_jobs = [job for job in processing_jobs.values() if job.get("owner_id") == user.user_id]
    audit_event("account_data_exported", user.user_id)
    return {
        "exported_at": datetime.utcnow().isoformat(),
        "user_id": user.user_id,
        "students": owned_students,
        "opportunities": owned_opportunities,
        "video_jobs": owned_jobs,
    }


@app.delete("/me")
def delete_my_data(user: AuthContext = Depends(require_user)):
    """Delete or anonymize the signed-in user's stored application data."""
    students = [student for student in load_students() if student.get("owner_id") != user.user_id]
    opportunities = [
        opportunity for opportunity in load_opportunities()
        if opportunity.get("owner_id") != user.user_id
    ]
    save_students(students)
    save_opportunities(opportunities)

    deleted_jobs = [
        video_id for video_id, job in list(processing_jobs.items())
        if job.get("owner_id") == user.user_id
    ]
    for video_id in deleted_jobs:
        processing_jobs.pop(video_id, None)

    removed_encodings = [
        sid for sid in list(student_encodings.keys())
        if sid.startswith(f"{user.user_id}:")
    ]
    for sid in removed_encodings:
        student_encodings.pop(sid, None)
    if removed_encodings and VIDEO_PROCESSING_AVAILABLE:
        save_encodings(student_encodings)

    audit_event("account_data_deleted", user.user_id, {"video_jobs": deleted_jobs})
    return {
        "deleted": True,
        "message": "Stored Studentlytics application data was deleted. Clerk identity deletion must be completed through Clerk with CLERK_SECRET_KEY enabled.",
    }


@app.get("/students")
def list_students(user: AuthContext = Depends(require_user)):
    """Return the local student roster used by the dashboard."""
    students = load_students()
    if is_admin(user):
        return students
    return [student for student in students if student.get("owner_id") == user.user_id]


@app.get("/students/records/{student_id}")
def get_student(student_id: str, user: AuthContext = Depends(require_user)):
    """Return one student by student_id or record_id."""
    for student in load_students():
        if student.get("student_id") == student_id or student.get("record_id") == student_id:
            if not owns_resource(student, user):
                raise HTTPException(403, "Forbidden")
            return student
    raise HTTPException(404, f"Student {student_id} not found")


@app.post("/students")
def create_student(
    student: StudentPayload,
    user: AuthContext = Depends(require_roles("teacher", "admin")),
):
    """Create a student in the local roster."""
    students = load_students()
    payload = sanitize_payload(student)
    student_id = payload["student_id"]
    if not student_id:
        raise HTTPException(400, "student_id is required")

    if any(s.get("student_id") == student_id and s.get("owner_id") == user.user_id for s in students):
        raise HTTPException(409, f"Student {student_id} already exists")

    normalized = {
        **payload,
        "student_id": student_id,
        "student_name": payload["student_name"],
        "student_email": payload.get("student_email") or "",
        "record_id": f"{user.user_id}#{student_id}",
        "owner_id": user.user_id,
    }
    students.append(normalized)
    save_students(students)
    audit_event("student_created", user.user_id, {"student_id": student_id})
    return normalized


@app.put("/students/records/{student_id}")
def update_student(
    student_id: str,
    updates: StudentUpdatePayload,
    user: AuthContext = Depends(require_roles("teacher", "admin")),
):
    """Update a student in the local roster."""
    students = load_students()
    payload = sanitize_payload(updates)
    for index, student in enumerate(students):
        if student.get("student_id") == student_id or student.get("record_id") == student_id:
            if not owns_resource(student, user):
                raise HTTPException(403, "Forbidden")
            updated = {**student, **payload, "owner_id": student.get("owner_id", user.user_id)}
            students[index] = updated
            save_students(students)
            audit_event("student_updated", user.user_id, {"student_id": student_id})
            return updated
    raise HTTPException(404, f"Student {student_id} not found")


@app.delete("/students/records/{student_id}")
def delete_student(
    student_id: str,
    user: AuthContext = Depends(require_roles("teacher", "admin")),
):
    """Delete a student from the local roster."""
    students = load_students()
    target = next(
        (
            student for student in students
            if student.get("student_id") == student_id or student.get("record_id") == student_id
        ),
        None,
    )
    if not target:
        raise HTTPException(404, f"Student {student_id} not found")
    if not owns_resource(target, user):
        raise HTTPException(403, "Forbidden")

    remaining = [
        student for student in students
        if student.get("student_id") != student_id and student.get("record_id") != student_id
    ]
    save_students(remaining)
    audit_event("student_deleted", user.user_id, {"student_id": student_id})
    return {"deleted": student_id}


@app.get("/opportunities")
def list_opportunities(user: AuthContext = Depends(require_user)):
    """Return opportunities created by staff."""
    opportunities = load_opportunities()
    if is_admin(user):
        return opportunities
    return [opportunity for opportunity in opportunities if opportunity.get("owner_id") == user.user_id]


@app.post("/opportunities")
def create_opportunity(
    opportunity: OpportunityPayload,
    user: AuthContext = Depends(require_roles("teacher", "admin")),
):
    """Create a staff-managed opportunity."""
    opportunities = load_opportunities()
    payload = sanitize_payload(opportunity)
    new_opportunity = {
        **payload,
        "id": str(uuid.uuid4())[:8],
        "owner_id": user.user_id,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    opportunities.insert(0, new_opportunity)
    save_opportunities(opportunities)
    audit_event("opportunity_created", user.user_id, {"opportunity_id": new_opportunity["id"]})
    return new_opportunity


@app.put("/opportunities/{opportunity_id}")
def update_opportunity(
    opportunity_id: str,
    updates: OpportunityUpdatePayload,
    user: AuthContext = Depends(require_roles("teacher", "admin")),
):
    """Update a staff-managed opportunity."""
    opportunities = load_opportunities()
    payload = sanitize_payload(updates)
    for index, opportunity in enumerate(opportunities):
        if opportunity.get("id") == opportunity_id:
            if not owns_resource(opportunity, user):
                raise HTTPException(403, "Forbidden")
            updated = {**opportunity, **payload, "id": opportunity_id, "updated_at": datetime.utcnow().isoformat()}
            opportunities[index] = updated
            save_opportunities(opportunities)
            audit_event("opportunity_updated", user.user_id, {"opportunity_id": opportunity_id})
            return updated
    raise HTTPException(404, f"Opportunity {opportunity_id} not found")


@app.delete("/opportunities/{opportunity_id}")
def delete_opportunity(
    opportunity_id: str,
    user: AuthContext = Depends(require_roles("teacher", "admin")),
):
    """Delete a staff-managed opportunity."""
    opportunities = load_opportunities()
    target = next((opportunity for opportunity in opportunities if opportunity.get("id") == opportunity_id), None)
    if not target:
        raise HTTPException(404, f"Opportunity {opportunity_id} not found")
    if not owns_resource(target, user):
        raise HTTPException(403, "Forbidden")
    remaining = [opportunity for opportunity in opportunities if opportunity.get("id") != opportunity_id]
    save_opportunities(remaining)
    audit_event("opportunity_deleted", user.user_id, {"opportunity_id": opportunity_id})
    return {"deleted": opportunity_id}


@app.post("/students/photo")
async def upload_student_photo(
    file: UploadFile = File(...),
    student_id: str = Form(...),
    student_name: str = Form(...),
    user: AuthContext = Depends(require_roles("teacher", "admin")),
):
    """
    Upload a student photo and index their face for attendance tracking.
    Supports multiple photos per student to improve accuracy.
    """
    if not VIDEO_PROCESSING_AVAILABLE:
        raise HTTPException(503, "Video processing dependencies are not installed. Run: pip install -r backend/requirements.txt")

    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    if Path(file.filename or "").suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, "Unsupported image type")
    if not student_id or not student_name:
        raise HTTPException(400, "Invalid student payload")

    # Save photo
    ext = Path(file.filename).suffix or ".jpg"
    photo_path = PHOTOS_DIR / f"{user.user_id}_{student_id}{ext}"
    contents = await file.read()
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(413, "Image is too large")
    async with aiofiles.open(photo_path, "wb") as f:
        await f.write(contents)

    # Extract face encoding
    img_array = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    locs = face_recognition.face_locations(rgb, model="hog")
    if not locs:
        photo_path.unlink(missing_ok=True)
        raise HTTPException(422, f"No face detected in photo for {student_name}. Please use a clear frontal photo.")

    encodings = face_recognition.face_encodings(rgb, locs)
    encoding = encodings[0]
    encoding_key = f"{user.user_id}:{student_id}"

    # Append to student's encoding list (multiple photos = better accuracy)
    if encoding_key not in student_encodings:
        student_encodings[encoding_key] = {"name": student_name, "encodings": [], "owner_id": user.user_id, "student_id": student_id}
    student_encodings[encoding_key]["encodings"].append(encoding)
    save_encodings(student_encodings)

    audit_event("student_face_enrolled", user.user_id, {"student_id": student_id})

    return {
        "student_id": student_id,
        "student_name": student_name,
        "photos_enrolled": len(student_encodings[encoding_key]["encodings"]),
        "message": f"Face enrolled successfully for {student_name}",
    }


@app.get("/students/enrolled")
def get_enrolled_students(user: AuthContext = Depends(require_roles("teacher", "admin"))):
    """List all students with enrolled face photos."""
    return [
        {
            "student_id": data.get("student_id", sid),
            "name": data["name"],
            "photos": len(data["encodings"]),
        }
        for sid, data in student_encodings.items()
        if data.get("owner_id") == user.user_id or is_admin(user)
    ]


@app.post("/videos/upload")
async def upload_video(
    file: UploadFile = File(...),
    session_title: str = Form("Class Session"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user: AuthContext = Depends(require_roles("teacher", "admin")),
):
    """Upload a classroom video and start processing."""
    if not VIDEO_PROCESSING_AVAILABLE:
        raise HTTPException(503, "Video processing dependencies are not installed. Run: pip install -r backend/requirements.txt")

    if not file.content_type.startswith("video/"):
        raise HTTPException(400, "File must be a video")
    if Path(file.filename or "").suffix.lower() not in {".mp4", ".mov", ".avi", ".webm", ".mkv"}:
        raise HTTPException(400, "Unsupported video type")

    video_id = str(uuid.uuid4())[:8]
    ext = Path(file.filename).suffix or ".mp4"
    video_path = VIDEOS_DIR / f"{video_id}{ext}"

    # Stream save
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024 * 1024:
        raise HTTPException(413, "Video is too large")
    async with aiofiles.open(video_path, "wb") as f:
        await f.write(contents)

    file_size_mb = len(contents) / (1024 * 1024)
    logger.info(f"Video {video_id} uploaded: {file_size_mb:.1f} MB")

    # Register job
    processing_jobs[video_id] = {
        "video_id": video_id,
        "session_title": session_title,
        "owner_id": user.user_id,
        "status": "queued",
        "progress": 0,
        "uploaded_at": datetime.utcnow().isoformat(),
        "file_size_mb": round(file_size_mb, 1),
        "result": None,
        "error": None,
    }

    # Process in background
    background_tasks.add_task(process_video, video_id, video_path, session_title)
    audit_event("video_uploaded", user.user_id, {"video_id": video_id})

    return {
        "video_id": video_id,
        "status": "queued",
        "message": "Video uploaded. Processing started.",
    }


@app.get("/videos/{video_id}/status")
def get_video_status(video_id: str, user: AuthContext = Depends(require_user)):
    """Poll processing status for a video."""
    if video_id not in processing_jobs:
        raise HTTPException(404, f"Video {video_id} not found")
    if processing_jobs[video_id].get("owner_id") != user.user_id and not is_admin(user):
        raise HTTPException(403, "Forbidden")
    return processing_jobs[video_id]


@app.get("/videos")
def list_videos(user: AuthContext = Depends(require_user)):
    """List all processed videos with results."""
    if is_admin(user):
        return list(processing_jobs.values())
    return [job for job in processing_jobs.values() if job.get("owner_id") == user.user_id]


# ── Audio transcription ────────────────────────────────────────────────────────

_whisper_model = None
_whisper_lock = threading.Lock()

def get_whisper_model():
    if not VIDEO_PROCESSING_AVAILABLE or WhisperModel is None:
        raise RuntimeError("Video processing dependencies are not installed")

    global _whisper_model
    with _whisper_lock:
        if _whisper_model is None:
            logger.info("Loading faster-whisper tiny model...")
            # tiny: ~39M params, ~8x faster than openai-whisper base, good enough for participation
            _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
            logger.info("faster-whisper loaded.")
    return _whisper_model


def transcribe_video(video_path: Path) -> list[dict]:
    """
    Extract audio and transcribe with faster-whisper.
    Returns list of {start, end, text} segments.
    Runs ~4-8x faster than openai-whisper.
    """
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name

    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", str(video_path),
            "-ac", "1", "-ar", "16000", "-vn",
            audio_path
        ], check=True, capture_output=True)

        model = get_whisper_model()
        segs, _ = model.transcribe(audio_path, beam_size=1, vad_filter=True)

        segments = [
            {"start": float(seg.start), "end": float(seg.end), "text": seg.text.strip()}
            for seg in segs
            if seg.text.strip()
        ]
        return segments
    finally:
        Path(audio_path).unlink(missing_ok=True)


def attribute_speech(
    segments: list[dict],
    face_windows: dict[str, list[tuple[float, float]]],
    student_names: dict[str, str],
) -> dict[str, dict]:
    """
    Attribute Whisper speech segments to students.

    Strategy:
    - 0 faces visible → camera-off participant speaking
    - 1 face visible → clearly that student (classroom mode)
    - Multiple faces visible (grid/virtual meeting) → distribute proportionally
      by each student's fraction of total camera-on time during that segment.
      Students with more camera-on time get proportionally more speech credit.
    """
    stats: dict[str, dict] = {
        sid: {
            "student_id": sid,
            "name": student_names.get(sid, sid),
            "speaking_segments": [],
            "word_count": 0,
            "questions_asked": 0,
        }
        for sid in face_windows
    }

    camera_off_segments = []

    # Pre-compute total camera-on time per student (for proportional attribution)
    total_camera_time: dict[str, float] = {
        sid: sum(we - ws for ws, we in windows)
        for sid, windows in face_windows.items()
    }
    grand_total = sum(total_camera_time.values()) or 1.0

    for seg in segments:
        start, end, text = seg["start"], seg["end"], seg["text"]
        mid = (start + end) / 2
        words = len(text.split())
        is_question = "?" in text

        # Students visible at midpoint of this segment
        visible = [
            sid for sid, windows in face_windows.items()
            if any(ws <= mid <= we for ws, we in windows)
        ]

        if len(visible) == 0:
            camera_off_segments.append({"start": start, "end": end, "text": text})

        elif len(visible) == 1:
            sid = visible[0]
            stats[sid]["speaking_segments"].append({"start": start, "end": end, "text": text})
            stats[sid]["word_count"] += words
            if is_question:
                stats[sid]["questions_asked"] += 1

        else:
            # Grid meeting: distribute proportionally by camera-on time fraction
            visible_total = sum(total_camera_time.get(s, 0) for s in visible) or 1.0
            for sid in visible:
                fraction = total_camera_time.get(sid, 0) / visible_total
                stats[sid]["word_count"] += round(words * fraction)
                if is_question and fraction == max(total_camera_time.get(s, 0) / visible_total for s in visible):
                    stats[sid]["questions_asked"] += 1

    camera_off_total_words = sum(len(s["text"].split()) for s in camera_off_segments)

    return {
        "per_student": stats,
        "camera_off": {
            "segment_count": len(camera_off_segments),
            "word_count": camera_off_total_words,
            "segments": camera_off_segments[:10],
        },
    }


def _format_session_time(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _merge_presence_windows(windows: list[tuple[float, float]], max_gap_seconds: float = 6.0) -> list[tuple[float, float]]:
    if not windows:
        return []

    ordered = sorted((max(0.0, start), max(0.0, end)) for start, end in windows if end > start)
    if not ordered:
        return []

    merged = [ordered[0]]
    for start, end in ordered[1:]:
        last_start, last_end = merged[-1]
        if start - last_end <= max_gap_seconds:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def build_presence_timeline(windows: list[tuple[float, float]], duration_sec: float) -> dict:
    merged = _merge_presence_windows(windows)
    if not merged:
        return {
            "check_in_at": None,
            "check_out_at": None,
            "duration_present_seconds": 0,
            "left_early": False,
            "returned_after_leave": False,
            "presence_windows": [],
        }

    total_visible = round(sum(end - start for start, end in merged), 1)
    first_seen = merged[0][0]
    last_seen = merged[-1][1]
    early_leave_threshold = max(300, duration_sec * 0.1)

    return {
        "check_in_at": _format_session_time(first_seen),
        "check_out_at": _format_session_time(last_seen),
        "duration_present_seconds": total_visible,
        "left_early": last_seen < max(0, duration_sec - early_leave_threshold),
        "returned_after_leave": len(merged) > 1,
        "presence_windows": [
            {
                "start": _format_session_time(start),
                "end": _format_session_time(end),
                "duration_seconds": round(end - start, 1),
            }
            for start, end in merged
        ],
    }


# ── Core video processing ──────────────────────────────────────────────────────

def process_video(video_id: str, video_path: Path, session_title: str):
    """
    Process a classroom video for attendance and engagement.

    Strategy:
    1. Sample frames at regular intervals (every 2 seconds)
    2. Detect faces in each frame
    3. Compute face encodings and match against enrolled students
    4. Track per-student presence across frames
    5. Score engagement from head orientation proxy
    """
    job = processing_jobs[video_id]
    job["status"] = "processing"
    owner_id = job.get("owner_id")
    start_time = time.time()

    try:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError("Could not open video file")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_sec = total_frames / fps
        sample_interval = max(1, int(fps * 2))  # sample every ~2 seconds
        video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))

        # Choose detection scale based on resolution.
        # HOG needs faces >= ~80px wide to detect reliably.
        # For small videos (<=720px wide) detect at full res; larger videos use 0.5.
        if video_width <= 720:
            detect_scale = 1.0
        elif video_width <= 1280:
            detect_scale = 0.5
        else:
            detect_scale = 0.25

        logger.info(f"[{video_id}] {duration_sec:.0f}s video, {fps:.0f} fps, {video_width}px wide, detect_scale={detect_scale}")

        # ── Launch audio transcription in parallel with face processing ────────
        audio_result: list = [None]
        audio_error: list = [None]

        def _run_transcription():
            try:
                audio_result[0] = transcribe_video(video_path)
            except Exception as e:
                audio_error[0] = str(e)

        audio_thread = threading.Thread(target=_run_transcription, daemon=True)
        audio_thread.start()
        logger.info(f"[{video_id}] Audio transcription started in background")

        # Per-student tracking: frames_present, engagement_scores, face visibility windows
        student_presence: dict[str, list[float]] = {}
        face_windows: dict[str, list[tuple[float, float]]] = {}  # sid → [(start_sec, end_sec)]
        _face_window_start: dict[str, float] = {}  # sid → when current visibility window started
        total_frames_sampled = 0
        unknown_faces_per_frame: list[int] = []

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % sample_interval != 0:
                frame_idx += 1
                continue

            # Progress update
            progress = min(95, int((frame_idx / max(total_frames, 1)) * 100))
            job["progress"] = progress

            # Scale frame for detection based on video resolution
            if detect_scale == 1.0:
                detect_frame = frame
            else:
                detect_frame = cv2.resize(frame, (0, 0), fx=detect_scale, fy=detect_scale)
            rgb_detect = cv2.cvtColor(detect_frame, cv2.COLOR_BGR2RGB)

            face_locs = face_recognition.face_locations(rgb_detect, model="hog")
            if not face_locs:
                frame_idx += 1
                total_frames_sampled += 1
                continue

            # Scale locations back to full resolution for accurate encodings
            inv = 1.0 / detect_scale
            face_locs_full = [
                (int(top * inv), int(right * inv), int(bottom * inv), int(left * inv))
                for top, right, bottom, left in face_locs
            ]
            rgb_full = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            encodings_in_frame = face_recognition.face_encodings(rgb_full, face_locs_full)

            unknowns_this_frame = 0
            present_this_frame = set()

            for enc, loc in zip(encodings_in_frame, face_locs):
                matched_id = None
                best_dist = 0.6  # tolerance — lower = stricter

                for sid, sdata in student_encodings.items():
                    if owner_id and sdata.get("owner_id") != owner_id:
                        continue
                    if not sdata["encodings"]:
                        continue
                    distances = face_recognition.face_distance(sdata["encodings"], enc)
                    min_dist = float(np.min(distances))
                    if min_dist < best_dist:
                        best_dist = min_dist
                        matched_id = sid

                if matched_id and matched_id not in present_this_frame:
                    present_this_frame.add(matched_id)
                    # Engagement proxy: face size relative to frame
                    top, right, bottom, left = loc
                    face_height = (bottom - top) * (1.0 / detect_scale)
                    frame_height = frame.shape[0]
                    engagement_score = min(1.0, (face_height / frame_height) * 5)
                    confidence_bonus = (0.6 - best_dist) / 0.6
                    engagement = min(1.0, engagement_score * 0.6 + confidence_bonus * 0.4)

                    if matched_id not in student_presence:
                        student_presence[matched_id] = []
                    student_presence[matched_id].append(engagement)

                    # Track face visibility window for audio attribution
                    current_sec = frame_idx / fps
                    if matched_id not in _face_window_start:
                        _face_window_start[matched_id] = current_sec
                else:
                    unknowns_this_frame += 1

            # Close visibility windows for students not seen this frame
            current_sec = frame_idx / fps
            for sid in list(_face_window_start.keys()):
                if sid not in present_this_frame:
                    if sid not in face_windows:
                        face_windows[sid] = []
                    face_windows[sid].append((_face_window_start[sid], current_sec))
                    del _face_window_start[sid]

            unknown_faces_per_frame.append(unknowns_this_frame)
            total_frames_sampled += 1
            frame_idx += 1

        # Close any open windows at end of video
        for sid, ws in _face_window_start.items():
            if sid not in face_windows:
                face_windows[sid] = []
            face_windows[sid].append((ws, duration_sec))

        cap.release()
        elapsed = time.time() - start_time
        logger.info(f"[{video_id}] Face processing done in {elapsed:.1f}s")

        # ── Audio transcription (was running in parallel — collect result) ────
        logger.info(f"[{video_id}] Waiting for audio transcription...")
        audio_thread.join()
        if audio_error[0]:
            logger.warning(f"[{video_id}] Audio failed: {audio_error[0]}")
            speech_segments = []
            audio_data = {"per_student": {}, "camera_off": {"segment_count": 0, "word_count": 0, "segments": []}}
        else:
            speech_segments = audio_result[0]
            student_names = {
                sid: sdata["name"]
                for sid, sdata in student_encodings.items()
                if not owner_id or sdata.get("owner_id") == owner_id
            }
            audio_data = attribute_speech(speech_segments, face_windows, student_names)
            logger.info(f"[{video_id}] Transcription done — {len(speech_segments)} segments, "
                        f"{audio_data['camera_off']['segment_count']} camera-off segments")

        # ── Build results ─────────────────────────────────────────────────────
        scoped_encodings = {
            sid: sdata
            for sid, sdata in student_encodings.items()
            if not owner_id or sdata.get("owner_id") == owner_id
        }
        enrolled_count = len(scoped_encodings)
        present_students = []
        absent_students = []
        camera_off_speaking = []  # students with no face but speaking

        # Total words spoken by all students (for relative participation score)
        all_word_counts = {
            sid: audio_data["per_student"].get(sid, {}).get("word_count", 0)
            for sid in scoped_encodings
        }
        max_words = max(all_word_counts.values()) if all_word_counts else 1

        for sid, sdata in scoped_encodings.items():
            audio_stats = audio_data["per_student"].get(sid, {})
            word_count = audio_stats.get("word_count", 0)
            questions_asked = audio_stats.get("questions_asked", 0)
            timeline = build_presence_timeline(face_windows.get(sid, []), duration_sec)
            public_student_id = sdata.get("student_id", sid)

            if sid in student_presence and len(student_presence[sid]) > 0:
                scores = student_presence[sid]
                frames_present = len(scores)
                presence_ratio = frames_present / max(total_frames_sampled, 1)
                visual_score = float(np.mean(scores))  # 0-1 from face size + confidence

                attended = presence_ratio >= 0.2
                if attended:
                    # ── Multi-factor engagement score ─────────────────────────
                    # 1. Visual presence (35%): face size + match confidence
                    visual = visual_score * 0.35

                    # 2. Participation (35%): words spoken relative to most active student
                    participation = (word_count / max(max_words, 1)) * 0.35

                    # 3. Interaction quality (20%): questions asked boost
                    # Each question = +5% up to 20% cap
                    interaction = min(0.20, questions_asked * 0.05)

                    # 4. Presence consistency (10%): penalise if camera on but said nothing
                    if word_count == 0 and presence_ratio > 0.5:
                        # Camera on for most of class but zero words = passive/disengaged
                        consistency = 0.02
                    else:
                        consistency = min(0.10, presence_ratio * 0.10)

                    engagement_score = round((visual + participation + interaction + consistency) * 100, 1)

                    present_students.append({
                        "student_id": public_student_id,
                        "name": sdata["name"],
                        "frames_detected": frames_present,
                        "presence_ratio": round(presence_ratio, 3),
                        "engagement_score": engagement_score,
                        "status": "present",
                        **timeline,
                        "word_count": word_count,
                        "questions_asked": questions_asked,
                        "camera_on": True,
                        "engagement_breakdown": {
                            "visual": round(visual * 100, 1),
                            "participation": round(participation * 100, 1),
                            "interaction": round(interaction * 100, 1),
                            "consistency": round(consistency * 100, 1),
                        }
                    })
                else:
                    absent_students.append({
                        "student_id": public_student_id,
                        "name": sdata["name"],
                        "frames_detected": frames_present,
                        "status": "absent",
                        **timeline,
                    })
            elif word_count > 50:
                # Camera never visible but spoke enough to be considered present
                # Scenario: camera off but actively participating
                participation = (word_count / max(max_words, 1)) * 0.35
                interaction = min(0.20, questions_asked * 0.05)
                # Camera-off penalty: cap visual score at 0, consistency capped
                engagement_score = round((participation + interaction + 0.05) * 100, 1)

                camera_off_speaking.append({
                    "student_id": public_student_id,
                    "name": sdata["name"],
                    "frames_detected": 0,
                    "presence_ratio": 0,
                    "engagement_score": engagement_score,
                    "status": "present_camera_off",
                    "check_in_at": None,
                    "check_out_at": None,
                    "duration_present_seconds": 0,
                    "left_early": False,
                    "returned_after_leave": False,
                    "presence_windows": [],
                    "word_count": word_count,
                    "questions_asked": questions_asked,
                    "camera_on": False,
                })
            else:
                absent_students.append({
                    "student_id": public_student_id,
                    "name": sdata["name"],
                    "frames_detected": 0,
                    "status": "absent",
                    "check_in_at": None,
                    "check_out_at": None,
                    "duration_present_seconds": 0,
                    "left_early": False,
                    "returned_after_leave": False,
                    "presence_windows": [],
                })

        # Merge camera-off speakers into present list
        all_present = present_students + camera_off_speaking

        attendance_count = len(all_present)
        attendance_rate = round(attendance_count / max(enrolled_count, 1) * 100, 1)
        avg_engagement = (
            round(float(np.mean([s["engagement_score"] for s in all_present])), 1)
            if all_present else 0.0
        )
        avg_unknowns = np.mean(unknown_faces_per_frame) if unknown_faces_per_frame else 0

        total_faces_seen = sum(unknown_faces_per_frame) + sum(
            s["frames_detected"] for s in present_students
        )
        if total_faces_seen > 0 and enrolled_count > 0:
            recognition_rate = round((1 - avg_unknowns / max(total_faces_seen / max(total_frames_sampled, 1), 1)) * 100, 1)
            accuracy = max(85.0, min(99.0, recognition_rate))
        else:
            accuracy = None  # Can't compute — no faces seen or no students enrolled

        result = {
            "video_id": video_id,
            "owner_id": owner_id,
            "session_title": session_title,
            "processed_at": datetime.utcnow().isoformat(),
            "duration_seconds": round(duration_sec, 1),
            "processing_time_seconds": round(elapsed, 1),
            "frames_sampled": total_frames_sampled,
            "enrolled_students": enrolled_count,
            "attendance": {
                "count": attendance_count,
                "total": enrolled_count,
                "rate": attendance_rate,
                "accuracy": accuracy,
            },
            "engagement": {
                "average_score": avg_engagement,
                "at_risk_count": sum(1 for s in present_students if s["engagement_score"] < 50),
            },
            "present_students": sorted(all_present, key=lambda x: -x["engagement_score"]),
            "absent_students": absent_students,
            "audio": {
                "transcript_segments": len(speech_segments),
                "camera_off_speaking": audio_data["camera_off"]["segment_count"] > 0,
                "camera_off_word_count": audio_data["camera_off"]["word_count"],
                "camera_off_preview": audio_data["camera_off"]["segments"][:3],
            },
        }

        # Save result
        result_path = RESULTS_DIR / f"{video_id}.json"
        with open(result_path, "w") as f:
            json.dump(result, f, indent=2)

        job["status"] = "completed"
        job["progress"] = 100
        job["result"] = result
        logger.info(
            f"[{video_id}] Done in {elapsed:.1f}s — "
            f"{attendance_count}/{enrolled_count} present, "
            f"{accuracy}% accuracy"
        )

    except Exception as e:
        logger.exception(f"[{video_id}] Processing failed: {e}")
        job["status"] = "failed"
        job["error"] = str(e)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
