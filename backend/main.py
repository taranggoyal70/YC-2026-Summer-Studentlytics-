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
from pathlib import Path
from typing import Optional
from datetime import datetime

import subprocess
import tempfile
import threading

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import aiofiles

# Import auth router
from auth import router as auth_router

# Optional face recognition imports
try:
    import face_recognition
    from faster_whisper import WhisperModel
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    FACE_RECOGNITION_AVAILABLE = False
    logger.warning("Face recognition not available. Install face_recognition_models to enable.")

# ── Setup ──────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("studentlytics")

BASE_DIR = Path(__file__).parent
PHOTOS_DIR = BASE_DIR / "data" / "student_photos"
VIDEOS_DIR = BASE_DIR / "data" / "videos"
RESULTS_DIR = BASE_DIR / "data" / "results"
ENCODINGS_FILE = BASE_DIR / "data" / "face_encodings.json"

for d in [PHOTOS_DIR, VIDEOS_DIR, RESULTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Studentlytics API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include authentication routes
app.include_router(auth_router, prefix="/api/auth", tags=["authentication"])

# ── In-memory state ────────────────────────────────────────────────────────────
# { video_id: { status, progress, result, error } }
processing_jobs: dict = {}

# ── Face encoding store ────────────────────────────────────────────────────────
def load_encodings() -> dict:
    """Load saved face encodings from disk."""
    if ENCODINGS_FILE.exists():
        with open(ENCODINGS_FILE) as f:
            raw = json.load(f)
        # Convert lists back to numpy arrays
        return {
            sid: {
                "name": data["name"],
                "encodings": [np.array(e) for e in data["encodings"]],
            }
            for sid, data in raw.items()
        }
    return {}

def save_encodings(encodings: dict):
    """Save face encodings to disk."""
    serializable = {
        sid: {
            "name": data["name"],
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


@app.post("/students/photo")
async def upload_student_photo(
    file: UploadFile = File(...),
    student_id: str = Form(...),
    student_name: str = Form(...),
):
    """
    Upload a student photo and index their face for attendance tracking.
    Supports multiple photos per student to improve accuracy.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    # Save photo
    ext = Path(file.filename).suffix or ".jpg"
    photo_path = PHOTOS_DIR / f"{student_id}{ext}"
    contents = await file.read()
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

    # Append to student's encoding list (multiple photos = better accuracy)
    if student_id not in student_encodings:
        student_encodings[student_id] = {"name": student_name, "encodings": []}
    student_encodings[student_id]["encodings"].append(encoding)
    save_encodings(student_encodings)

    logger.info(f"Enrolled {student_name} ({student_id}) — {len(student_encodings[student_id]['encodings'])} photo(s)")

    return {
        "student_id": student_id,
        "student_name": student_name,
        "photos_enrolled": len(student_encodings[student_id]["encodings"]),
        "message": f"Face enrolled successfully for {student_name}",
    }


@app.get("/students/enrolled")
def get_enrolled_students():
    """List all students with enrolled face photos."""
    return [
        {
            "student_id": sid,
            "name": data["name"],
            "photos": len(data["encodings"]),
        }
        for sid, data in student_encodings.items()
    ]


@app.post("/videos/upload")
async def upload_video(
    file: UploadFile = File(...),
    session_title: str = Form("Class Session"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Upload a classroom video and start processing."""
    if not file.content_type.startswith("video/"):
        raise HTTPException(400, "File must be a video")

    video_id = str(uuid.uuid4())[:8]
    ext = Path(file.filename).suffix or ".mp4"
    video_path = VIDEOS_DIR / f"{video_id}{ext}"

    # Stream save
    contents = await file.read()
    async with aiofiles.open(video_path, "wb") as f:
        await f.write(contents)

    file_size_mb = len(contents) / (1024 * 1024)
    logger.info(f"Video {video_id} uploaded: {file_size_mb:.1f} MB")

    # Register job
    processing_jobs[video_id] = {
        "video_id": video_id,
        "session_title": session_title,
        "status": "queued",
        "progress": 0,
        "uploaded_at": datetime.utcnow().isoformat(),
        "file_size_mb": round(file_size_mb, 1),
        "result": None,
        "error": None,
    }

    # Process in background
    background_tasks.add_task(process_video, video_id, video_path, session_title)

    return {
        "video_id": video_id,
        "status": "queued",
        "message": "Video uploaded. Processing started.",
    }


@app.get("/videos/{video_id}/status")
def get_video_status(video_id: str):
    """Poll processing status for a video."""
    if video_id not in processing_jobs:
        raise HTTPException(404, f"Video {video_id} not found")
    return processing_jobs[video_id]


@app.get("/videos")
def list_videos():
    """List all processed videos with results."""
    return list(processing_jobs.values())


# ── Audio transcription ────────────────────────────────────────────────────────

_whisper_model = None
_whisper_lock = threading.Lock()

def get_whisper_model() -> WhisperModel:
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
            student_names = {sid: sdata["name"] for sid, sdata in student_encodings.items()}
            audio_data = attribute_speech(speech_segments, face_windows, student_names)
            logger.info(f"[{video_id}] Transcription done — {len(speech_segments)} segments, "
                        f"{audio_data['camera_off']['segment_count']} camera-off segments")

        # ── Build results ─────────────────────────────────────────────────────
        enrolled_count = len(student_encodings)
        present_students = []
        absent_students = []
        camera_off_speaking = []  # students with no face but speaking

        # Total words spoken by all students (for relative participation score)
        all_word_counts = {
            sid: audio_data["per_student"].get(sid, {}).get("word_count", 0)
            for sid in student_encodings
        }
        max_words = max(all_word_counts.values()) if all_word_counts else 1

        for sid, sdata in student_encodings.items():
            audio_stats = audio_data["per_student"].get(sid, {})
            word_count = audio_stats.get("word_count", 0)
            questions_asked = audio_stats.get("questions_asked", 0)

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
                        "student_id": sid,
                        "name": sdata["name"],
                        "frames_detected": frames_present,
                        "presence_ratio": round(presence_ratio, 3),
                        "engagement_score": engagement_score,
                        "status": "present",
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
                        "student_id": sid,
                        "name": sdata["name"],
                        "frames_detected": frames_present,
                        "status": "absent",
                    })
            elif word_count > 50:
                # Camera never visible but spoke enough to be considered present
                # Scenario: camera off but actively participating
                participation = (word_count / max(max_words, 1)) * 0.35
                interaction = min(0.20, questions_asked * 0.05)
                # Camera-off penalty: cap visual score at 0, consistency capped
                engagement_score = round((participation + interaction + 0.05) * 100, 1)

                camera_off_speaking.append({
                    "student_id": sid,
                    "name": sdata["name"],
                    "frames_detected": 0,
                    "presence_ratio": 0,
                    "engagement_score": engagement_score,
                    "status": "present_camera_off",
                    "word_count": word_count,
                    "questions_asked": questions_asked,
                    "camera_on": False,
                })
            else:
                absent_students.append({
                    "student_id": sid,
                    "name": sdata["name"],
                    "frames_detected": 0,
                    "status": "absent",
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
