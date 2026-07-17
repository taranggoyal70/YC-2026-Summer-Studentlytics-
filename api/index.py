"""
Studentlytics API — FastAPI on Vercel Python (Fluid Compute).

Storage: Neon Postgres (DATABASE_URL). Media: Vercel Blob (client uploads via
/api/upload). Biometric processing runs in the GitHub Actions worker
(worker/analyze.py), never in this function — see ADR-0001 and ADR-0005.

HTTP surface keeps the legacy /api/students and /api/opportunities routes the
frontend already calls; the database schema uses the CONTEXT.md nouns
(participants, spaces, sessions, recordings, analysis jobs).
"""

import json
import logging
import os
import urllib.request
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

import jwt
import psycopg2
import psycopg2.extras
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, EmailStr, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("studentlytics.api")
security = HTTPBearer(auto_error=False)

CLERK_ISSUER = os.getenv("CLERK_ISSUER", "").strip()
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "").strip()
CLERK_AUDIENCE = os.getenv("CLERK_AUDIENCE", "").strip() or None
CLERK_AUTHORIZED_PARTIES = [
    origin.strip()
    for origin in os.getenv("CLERK_AUTHORIZED_PARTIES", os.getenv("FRONTEND_ORIGINS", "")).split(",")
    if origin.strip()
]
GH_REPO = os.getenv("GH_REPO", "").strip()
GH_DISPATCH_TOKEN = os.getenv("GH_DISPATCH_TOKEN", "").strip()

ALLOWED_ROLES = {"student", "teacher", "admin"}
Role = Literal["student", "teacher", "admin"]

_jwks_client: Optional[jwt.PyJWKClient] = None


class AuthContext(BaseModel):
    user_id: str
    role: Role
    email: Optional[str] = None


# ── Database ───────────────────────────────────────────────────────────────────

@contextmanager
def db():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def rows(cur) -> List[Dict[str, Any]]:
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def audit(conn, event: str, actor_id: Optional[str], metadata: Optional[dict] = None):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO audit_events (event, actor_id, metadata) VALUES (%s, %s, %s)",
            (event, actor_id, json.dumps(metadata or {})),
        )


# ── Auth ───────────────────────────────────────────────────────────────────────

def _get_jwks_client() -> jwt.PyJWKClient:
    global _jwks_client
    jwks_url = CLERK_JWKS_URL or (f"{CLERK_ISSUER.rstrip('/')}/.well-known/jwks.json" if CLERK_ISSUER else "")
    if not jwks_url:
        raise RuntimeError("Clerk JWT verification is not configured")
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(jwks_url)
    return _jwks_client


def _extract_role(payload: Dict[str, Any]) -> str:
    role = (
        payload.get("role")
        or (payload.get("public_metadata") or {}).get("role")
        or (payload.get("metadata") or {}).get("role")
        or "student"
    )
    return role if role in ALLOWED_ROLES else "student"


async def require_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthContext:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    try:
        token = credentials.credentials
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        decode_kwargs: Dict[str, Any] = {
            "algorithms": ["RS256"],
            "options": {"verify_aud": bool(CLERK_AUDIENCE)},
        }
        if CLERK_ISSUER:
            decode_kwargs["issuer"] = CLERK_ISSUER
        if CLERK_AUDIENCE:
            decode_kwargs["audience"] = CLERK_AUDIENCE
        payload = jwt.decode(token, signing_key.key, **decode_kwargs)
        azp = payload.get("azp")
        if CLERK_AUTHORIZED_PARTIES and azp and azp not in CLERK_AUTHORIZED_PARTIES:
            raise ValueError("Token authorized party is not allowed")
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Token missing subject")
        return AuthContext(user_id=user_id, role=_extract_role(payload), email=payload.get("email"))
    except Exception:
        logger.warning("Authentication token verification failed")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")


def require_roles(*roles: str):
    async def dependency(user: AuthContext = Depends(require_user)) -> AuthContext:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
        return user

    return dependency


def get_org_id(conn, user: AuthContext) -> str:
    """Every authenticated user gets one organization, created on first touch."""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM organizations WHERE owner_id = %s LIMIT 1", (user.user_id,))
        row = cur.fetchone()
        if row:
            return str(row[0])
        cur.execute(
            "INSERT INTO organizations (name, owner_id) VALUES (%s, %s) RETURNING id",
            ("My Organization", user.user_id),
        )
        return str(cur.fetchone()[0])


def get_default_space(conn, org_id: str) -> str:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM spaces WHERE org_id = %s ORDER BY created_at LIMIT 1", (org_id,))
        row = cur.fetchone()
        if row:
            return str(row[0])
        cur.execute(
            "INSERT INTO spaces (org_id, name, kind) VALUES (%s, %s, %s) RETURNING id",
            (org_id, "General", "class"),
        )
        return str(cur.fetchone()[0])


# ── Payloads ───────────────────────────────────────────────────────────────────

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class StudentPayload(StrictModel):
    student_id: str = Field(min_length=1, max_length=80)
    student_name: str = Field(min_length=1, max_length=120)
    student_email: Optional[EmailStr] = None
    major: Optional[str] = Field(default=None, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)
    cohort: Optional[str] = Field(default=None, max_length=120)
    topic: Optional[str] = Field(default=None, max_length=120)


class StudentUpdatePayload(StrictModel):
    student_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    student_email: Optional[EmailStr] = None
    major: Optional[str] = Field(default=None, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)
    cohort: Optional[str] = Field(default=None, max_length=120)
    topic: Optional[str] = Field(default=None, max_length=120)


class OpportunityPayload(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    company: str = Field(min_length=1, max_length=160)
    type: Literal["Job shadows", "Micro-internships", "Networking", "Mentorship", "Hackathons"]
    tags: List[str] = Field(default_factory=list, max_length=10)
    location: str = Field(min_length=1, max_length=160)
    pay: Optional[str] = Field(default=None, max_length=80)
    duration: Optional[str] = Field(default=None, max_length=80)
    spots: Optional[int] = Field(default=None, ge=0, le=100000)
    students: Optional[int] = Field(default=None, ge=0, le=100000)
    deadline: Optional[str] = Field(default=None, max_length=80)
    status: Optional[Literal["New", "Closes Soon"]] = None
    isPaid: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=4000)


class OpportunityUpdatePayload(StrictModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    company: Optional[str] = Field(default=None, min_length=1, max_length=160)
    type: Optional[Literal["Job shadows", "Micro-internships", "Networking", "Mentorship", "Hackathons"]] = None
    tags: Optional[List[str]] = Field(default=None, max_length=10)
    location: Optional[str] = Field(default=None, min_length=1, max_length=160)
    pay: Optional[str] = Field(default=None, max_length=80)
    duration: Optional[str] = Field(default=None, max_length=80)
    spots: Optional[int] = Field(default=None, ge=0, le=100000)
    students: Optional[int] = Field(default=None, ge=0, le=100000)
    deadline: Optional[str] = Field(default=None, max_length=80)
    status: Optional[Literal["New", "Closes Soon"]] = None
    isPaid: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=4000)


class SessionPayload(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    location: Optional[str] = Field(default=None, max_length=200)
    kind: Literal["virtual", "in-person"] = "virtual"


class RecordingRegisterPayload(StrictModel):
    blob_url: str = Field(min_length=10, max_length=1000)
    filename: Optional[str] = Field(default=None, max_length=300)
    size_mb: Optional[float] = Field(default=None, ge=0)
    session_id: Optional[str] = None
    session_title: Optional[str] = Field(default=None, max_length=200)


class PhotoRegisterPayload(StrictModel):
    blob_url: str = Field(min_length=10, max_length=1000)


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Studentlytics API", version="2.0.0")
router = APIRouter(prefix="/api")


def _participant_to_student(p: Dict[str, Any]) -> Dict[str, Any]:
    """Legacy wire shape used by the existing frontend services."""
    return {
        "record_id": str(p["id"]),
        "student_id": p["external_id"],
        "student_name": p["name"],
        "student_email": p.get("email") or "",
        "major": p.get("major"),
        "department": p.get("department"),
        "cohort": p.get("cohort"),
        "photo_url": p.get("photo_url"),
        "face_enrolled": bool(p.get("face_enrolled")),
        "created_at": p["created_at"].isoformat() if p.get("created_at") else None,
    }


@router.get("/health")
def health():
    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM participants")
        participants = cur.fetchone()[0]
    return {"status": "ok", "version": "2.0.0", "participants": participants}


@router.get("/me")
async def me(user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
    return {"user_id": user.user_id, "role": user.role, "email": user.email, "org_id": org_id}


# ── Participants (legacy alias: /students) ────────────────────────────────────

@router.get("/students")
async def list_students(user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.*, (ft.participant_id IS NOT NULL) AS face_enrolled
                   FROM participants p LEFT JOIN face_templates ft ON ft.participant_id = p.id
                   WHERE p.org_id = %s ORDER BY p.name""",
                (org_id,),
            )
            return [_participant_to_student(p) for p in rows(cur)]


@router.get("/students/records/{record_id}")
async def get_student(record_id: str, user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.*, (ft.participant_id IS NOT NULL) AS face_enrolled
                   FROM participants p LEFT JOIN face_templates ft ON ft.participant_id = p.id
                   WHERE p.org_id = %s AND (p.id::text = %s OR p.external_id = %s)""",
                (org_id, record_id, record_id),
            )
            found = rows(cur)
    if not found:
        raise HTTPException(404, f"Participant {record_id} not found")
    return _participant_to_student(found[0])


@router.post("/students")
async def create_student(payload: StudentPayload, user: AuthContext = Depends(require_roles("teacher", "admin"))):
    with db() as conn:
        org_id = get_org_id(conn, user)
        space_id = get_default_space(conn, org_id)
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM participants WHERE org_id = %s AND external_id = %s", (org_id, payload.student_id))
            if cur.fetchone():
                raise HTTPException(409, f"Participant {payload.student_id} already exists")
            cur.execute(
                """INSERT INTO participants (org_id, external_id, name, email, major, department, cohort)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (org_id, payload.student_id, payload.student_name, payload.student_email,
                 payload.major, payload.department, payload.cohort),
            )
            participant = rows(cur)[0]
            cur.execute(
                "INSERT INTO roster_entries (space_id, participant_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (space_id, participant["id"]),
            )
        audit(conn, "participant_created", user.user_id, {"external_id": payload.student_id})
    return _participant_to_student(participant)


@router.put("/students/records/{record_id}")
async def update_student(record_id: str, payload: StudentUpdatePayload, user: AuthContext = Depends(require_roles("teacher", "admin"))):
    updates = payload.model_dump(exclude_none=True)
    column_map = {"student_name": "name", "student_email": "email"}
    sets, values = [], []
    for key, value in updates.items():
        col = column_map.get(key, key)
        if col in {"name", "email", "major", "department", "cohort"}:
            sets.append(f"{col} = %s")
            values.append(value)
    if not sets:
        raise HTTPException(400, "No updatable fields provided")
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                f"""UPDATE participants SET {', '.join(sets)}, updated_at = now()
                    WHERE org_id = %s AND (id::text = %s OR external_id = %s) RETURNING *""",
                (*values, org_id, record_id, record_id),
            )
            updated = rows(cur)
        if not updated:
            raise HTTPException(404, f"Participant {record_id} not found")
        audit(conn, "participant_updated", user.user_id, {"record_id": record_id})
    return _participant_to_student(updated[0])


@router.delete("/students/records/{record_id}")
async def delete_student(record_id: str, user: AuthContext = Depends(require_roles("teacher", "admin"))):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM participants WHERE org_id = %s AND (id::text = %s OR external_id = %s) RETURNING id",
                (org_id, record_id, record_id),
            )
            deleted = cur.fetchall()
        if not deleted:
            raise HTTPException(404, f"Participant {record_id} not found")
        audit(conn, "participant_deleted", user.user_id, {"record_id": record_id})
    return {"deleted": record_id}


@router.post("/students/records/{record_id}/photo")
async def register_participant_photo(record_id: str, payload: PhotoRegisterPayload, user: AuthContext = Depends(require_roles("teacher", "admin"))):
    """Attach an enrollment photo (already uploaded to Blob). Face encoding happens in the worker."""
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE participants SET photo_url = %s, updated_at = now()
                   WHERE org_id = %s AND (id::text = %s OR external_id = %s) RETURNING *""",
                (payload.blob_url, org_id, record_id, record_id),
            )
            updated = rows(cur)
            if updated:
                # Photo changed: stale template must be recomputed by the worker.
                cur.execute("DELETE FROM face_templates WHERE participant_id = %s", (updated[0]["id"],))
        if not updated:
            raise HTTPException(404, f"Participant {record_id} not found")
        audit(conn, "participant_photo_registered", user.user_id, {"record_id": record_id})
    return {"photo_url": payload.blob_url, "message": "Photo registered. Face enrollment runs with the next analysis."}


# ── Sessions ───────────────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT s.*, sp.name AS space_name,
                          (SELECT count(*) FROM roster_entries re WHERE re.space_id = s.space_id) AS roster_count,
                          (SELECT count(*) FROM recordings r WHERE r.session_id = s.id) AS recording_count,
                          (SELECT aj.status FROM analysis_jobs aj WHERE aj.session_id = s.id
                           ORDER BY aj.created_at DESC LIMIT 1) AS latest_job_status
                   FROM sessions s JOIN spaces sp ON sp.id = s.space_id
                   WHERE sp.org_id = %s ORDER BY s.starts_at DESC NULLS LAST, s.created_at DESC""",
                (org_id,),
            )
            return json_ready(rows(cur))


@router.post("/sessions")
async def create_session(payload: SessionPayload, user: AuthContext = Depends(require_roles("teacher", "admin"))):
    with db() as conn:
        org_id = get_org_id(conn, user)
        space_id = get_default_space(conn, org_id)
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO sessions (space_id, title, starts_at, ends_at, location, kind, created_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (space_id, payload.title, payload.starts_at, payload.ends_at, payload.location, payload.kind, user.user_id),
            )
            session = rows(cur)[0]
        audit(conn, "session_created", user.user_id, {"session_id": str(session["id"])})
    return json_ready(session)


@router.get("/sessions/{session_id}/report")
async def session_report(session_id: str, user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT s.* FROM sessions s JOIN spaces sp ON sp.id = s.space_id
                   WHERE s.id::text = %s AND sp.org_id = %s""",
                (session_id, org_id),
            )
            sessions_found = rows(cur)
            if not sessions_found:
                raise HTTPException(404, "Session not found")
            cur.execute(
                """SELECT ad.*, p.name AS participant_name, p.external_id
                   FROM attendance_decisions ad JOIN participants p ON p.id = ad.participant_id
                   WHERE ad.session_id = %s ORDER BY p.name""",
                (session_id,),
            )
            decisions = rows(cur)
            cur.execute(
                """SELECT pw.participant_id, pw.start_seconds, pw.end_seconds
                   FROM presence_windows pw JOIN analysis_jobs aj ON aj.id = pw.job_id
                   WHERE aj.session_id = %s ORDER BY pw.start_seconds""",
                (session_id,),
            )
            windows = rows(cur)
    by_participant: Dict[str, List[dict]] = {}
    for w in windows:
        by_participant.setdefault(str(w["participant_id"]), []).append(
            {"start_seconds": w["start_seconds"], "end_seconds": w["end_seconds"]}
        )
    for d in decisions:
        d["presence_windows"] = by_participant.get(str(d["participant_id"]), [])
    return json_ready({"session": sessions_found[0], "decisions": decisions})


# ── Recordings & analysis jobs ────────────────────────────────────────────────

def dispatch_worker(job_id: str) -> None:
    if not (GH_REPO and GH_DISPATCH_TOKEN):
        raise HTTPException(503, "Analysis worker is not configured (GH_REPO / GH_DISPATCH_TOKEN)")
    request_body = json.dumps({"ref": "main", "inputs": {"job_id": job_id}}).encode()
    req = urllib.request.Request(
        f"https://api.github.com/repos/{GH_REPO}/actions/workflows/analyze.yml/dispatches",
        data=request_body,
        headers={
            "Authorization": f"Bearer {GH_DISPATCH_TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "studentlytics-api",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status not in (200, 204):
            raise HTTPException(502, f"Worker dispatch failed with status {resp.status}")


@router.post("/videos/register")
async def register_recording(payload: RecordingRegisterPayload, user: AuthContext = Depends(require_roles("teacher", "admin"))):
    """Register a Blob-uploaded recording, create its analysis job, dispatch the worker."""
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            session_id = payload.session_id
            if session_id:
                cur.execute(
                    """SELECT s.id FROM sessions s JOIN spaces sp ON sp.id = s.space_id
                       WHERE s.id::text = %s AND sp.org_id = %s""",
                    (session_id, org_id),
                )
                if not cur.fetchone():
                    raise HTTPException(404, "Session not found")
            else:
                space_id = get_default_space(conn, org_id)
                cur.execute(
                    """INSERT INTO sessions (space_id, title, kind, status, created_by, starts_at)
                       VALUES (%s, %s, 'virtual', 'completed', %s, now()) RETURNING id""",
                    (space_id, payload.session_title or "Uploaded Session", user.user_id),
                )
                session_id = str(cur.fetchone()[0])
            cur.execute(
                """INSERT INTO recordings (session_id, blob_url, filename, size_mb, uploaded_by)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                (session_id, payload.blob_url, payload.filename, payload.size_mb, user.user_id),
            )
            recording_id = str(cur.fetchone()[0])
            cur.execute(
                """INSERT INTO analysis_jobs (recording_id, session_id, status, created_by)
                   VALUES (%s, %s, 'queued', %s) RETURNING id""",
                (recording_id, session_id, user.user_id),
            )
            job_id = str(cur.fetchone()[0])
        audit(conn, "recording_registered", user.user_id, {"recording_id": recording_id, "job_id": job_id})
    dispatch_worker(job_id)
    return {"video_id": job_id, "session_id": session_id, "status": "queued",
            "message": "Recording registered. Analysis dispatched."}


def _seconds_to_clock(seconds: Optional[float]) -> Optional[str]:
    if seconds is None:
        return None
    total = max(0, int(round(seconds)))
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def _job_result_with_participants(conn, job: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Expand the stored summary result with per-participant decisions in the
    legacy wire shape (present_students / absent_students) the frontend renders."""
    if job["status"] != "completed" or not job["result"]:
        return job["result"]
    with conn.cursor() as cur:
        cur.execute(
            """SELECT ad.*, p.name, p.external_id
               FROM attendance_decisions ad JOIN participants p ON p.id = ad.participant_id
               WHERE ad.job_id = %s ORDER BY ad.engagement_score DESC NULLS LAST""",
            (job["id"],),
        )
        decisions = rows(cur)
        cur.execute(
            "SELECT participant_id, start_seconds, end_seconds FROM presence_windows WHERE job_id = %s ORDER BY start_seconds",
            (job["id"],),
        )
        windows = rows(cur)
    windows_by_participant: Dict[str, List[dict]] = {}
    for w in windows:
        windows_by_participant.setdefault(str(w["participant_id"]), []).append({
            "start": _seconds_to_clock(w["start_seconds"]),
            "end": _seconds_to_clock(w["end_seconds"]),
            "duration_seconds": round(w["end_seconds"] - w["start_seconds"], 1),
        })
    present, absent = [], []
    for d in decisions:
        base = {
            "student_id": d["external_id"],
            "name": d["name"],
            "frames_detected": 0,
            "presence_ratio": d["confidence"] or 0,
            "engagement_score": d["engagement_score"] or 0,
            "status": "present_camera_off" if d["status"] == "camera_off_present" else d["status"],
            "check_in_at": _seconds_to_clock(d["check_in_seconds"]),
            "check_out_at": _seconds_to_clock(d["check_out_seconds"]),
            "duration_present_seconds": d["duration_present_seconds"] or 0,
            "left_early": d["left_early"],
            "returned_after_leave": d["returned_after_leave"],
            "presence_windows": windows_by_participant.get(str(d["participant_id"]), []),
            "word_count": d["word_count"],
            "questions_asked": d["questions_asked"],
            "camera_on": d["camera_on"],
            "engagement_breakdown": d["engagement_breakdown"],
        }
        (absent if d["status"] in ("absent", "unknown") else present).append(base)
    result = dict(job["result"])
    result["present_students"] = present
    result["absent_students"] = absent
    return result


@router.get("/videos/{job_id}/status")
async def job_status(job_id: str, user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT aj.*, s.title AS session_title, r.filename, r.size_mb, r.uploaded_at
                   FROM analysis_jobs aj
                   JOIN sessions s ON s.id = aj.session_id
                   JOIN spaces sp ON sp.id = s.space_id
                   JOIN recordings r ON r.id = aj.recording_id
                   WHERE aj.id::text = %s AND sp.org_id = %s""",
                (job_id, org_id),
            )
            jobs = rows(cur)
        if not jobs:
            raise HTTPException(404, f"Job {job_id} not found")
        job = jobs[0]
        result = _job_result_with_participants(conn, job)
    return json_ready({
        "video_id": str(job["id"]),
        "session_id": str(job["session_id"]),
        "session_title": job["session_title"],
        "status": job["status"],
        "progress": job["progress"],
        "uploaded_at": job["uploaded_at"],
        "file_size_mb": job["size_mb"],
        "result": result,
        "error": job["error"],
    })


@router.get("/videos")
async def list_jobs(user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT aj.id, aj.session_id, aj.status, aj.progress, aj.result, aj.error, aj.created_at,
                          s.title AS session_title, r.filename, r.size_mb, r.uploaded_at
                   FROM analysis_jobs aj
                   JOIN sessions s ON s.id = aj.session_id
                   JOIN spaces sp ON sp.id = s.space_id
                   JOIN recordings r ON r.id = aj.recording_id
                   WHERE sp.org_id = %s ORDER BY aj.created_at DESC""",
                (org_id,),
            )
            jobs = rows(cur)
        payload = [
            {
                "video_id": str(j["id"]),
                "session_id": str(j["session_id"]),
                "session_title": j["session_title"],
                "status": j["status"],
                "progress": j["progress"],
                "uploaded_at": j["uploaded_at"],
                "file_size_mb": j["size_mb"],
                "result": _job_result_with_participants(conn, j),
                "error": j["error"],
            }
            for j in jobs
        ]
    return json_ready(payload)


@router.get("/students/enrolled")
async def enrolled_students(user: AuthContext = Depends(require_roles("teacher", "admin"))):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.external_id AS student_id, p.name, ft.photos_enrolled AS photos
                   FROM participants p JOIN face_templates ft ON ft.participant_id = p.id
                   WHERE p.org_id = %s ORDER BY p.name""",
                (org_id,),
            )
            return rows(cur)


# ── Analytics ──────────────────────────────────────────────────────────────────

@router.get("/analytics/overview")
async def analytics_overview(user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM participants WHERE org_id = %s", (org_id,))
            participants = cur.fetchone()[0]
            cur.execute(
                """SELECT count(*) FROM sessions s JOIN spaces sp ON sp.id = s.space_id WHERE sp.org_id = %s""",
                (org_id,),
            )
            sessions_count = cur.fetchone()[0]
            cur.execute(
                """SELECT
                     count(*) FILTER (WHERE ad.status IN ('present', 'camera_off_present', 'late', 'left_early')) AS attended,
                     count(*) AS total,
                     avg(ad.engagement_score) AS avg_engagement
                   FROM attendance_decisions ad
                   JOIN sessions s ON s.id = ad.session_id
                   JOIN spaces sp ON sp.id = s.space_id
                   WHERE sp.org_id = %s""",
                (org_id,),
            )
            attended, total, avg_engagement = cur.fetchone()
            cur.execute(
                """SELECT count(*) FROM analysis_jobs aj
                   JOIN sessions s ON s.id = aj.session_id JOIN spaces sp ON sp.id = s.space_id
                   WHERE sp.org_id = %s AND aj.status = 'completed'""",
                (org_id,),
            )
            completed_jobs = cur.fetchone()[0]
    return {
        "participants": participants,
        "sessions": sessions_count,
        "analyses_completed": completed_jobs,
        "attendance_rate": round(100.0 * attended / total, 1) if total else None,
        "average_engagement": round(float(avg_engagement), 1) if avg_engagement is not None else None,
    }


@router.get("/analytics/leaderboard")
async def analytics_leaderboard(user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.id, p.external_id, p.name, p.email, p.major, p.cohort,
                          count(ad.id) AS sessions_analyzed,
                          count(*) FILTER (WHERE ad.status IN ('present', 'camera_off_present', 'late', 'left_early')) AS sessions_attended,
                          avg(ad.engagement_score) AS avg_engagement,
                          sum(ad.word_count) AS total_words,
                          sum(ad.questions_asked) AS total_questions
                   FROM participants p
                   LEFT JOIN attendance_decisions ad ON ad.participant_id = p.id
                   WHERE p.org_id = %s
                   GROUP BY p.id ORDER BY avg(ad.engagement_score) DESC NULLS LAST, p.name""",
                (org_id,),
            )
            board = rows(cur)
    for entry in board:
        analyzed = entry["sessions_analyzed"] or 0
        entry["attendance_rate"] = round(100.0 * entry["sessions_attended"] / analyzed, 1) if analyzed else None
        entry["avg_engagement"] = round(float(entry["avg_engagement"]), 1) if entry["avg_engagement"] is not None else None
    return json_ready(board)


# ── Opportunities ──────────────────────────────────────────────────────────────

def _opportunity_out(o: Dict[str, Any]) -> Dict[str, Any]:
    return json_ready({
        "id": str(o["id"]),
        "title": o["title"],
        "company": o["company"],
        "type": o["type"],
        "tags": o["tags"] or [],
        "location": o["location"],
        "pay": o["pay"],
        "duration": o["duration"],
        "spots": o["spots"],
        "students": o["students"],
        "deadline": o["deadline"],
        "status": o["status"],
        "isPaid": o["is_paid"],
        "description": o["description"],
        "created_at": o["created_at"],
        "updated_at": o["updated_at"],
    })


@router.get("/opportunities")
async def list_opportunities(user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM opportunities WHERE org_id = %s ORDER BY created_at DESC", (org_id,))
            return [_opportunity_out(o) for o in rows(cur)]


@router.post("/opportunities")
async def create_opportunity(payload: OpportunityPayload, user: AuthContext = Depends(require_roles("teacher", "admin"))):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO opportunities (org_id, title, company, type, tags, location, pay, duration,
                                              spots, students, deadline, status, is_paid, description, owner_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (org_id, payload.title, payload.company, payload.type, payload.tags, payload.location,
                 payload.pay, payload.duration, payload.spots, payload.students, payload.deadline,
                 payload.status, payload.isPaid, payload.description, user.user_id),
            )
            created = rows(cur)[0]
        audit(conn, "opportunity_created", user.user_id, {"opportunity_id": str(created["id"])})
    return _opportunity_out(created)


@router.put("/opportunities/{opportunity_id}")
async def update_opportunity(opportunity_id: str, payload: OpportunityUpdatePayload, user: AuthContext = Depends(require_roles("teacher", "admin"))):
    updates = payload.model_dump(exclude_none=True)
    column_map = {"isPaid": "is_paid"}
    sets, values = [], []
    for key, value in updates.items():
        col = column_map.get(key, key)
        sets.append(f"{col} = %s")
        values.append(value)
    if not sets:
        raise HTTPException(400, "No updatable fields provided")
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE opportunities SET {', '.join(sets)}, updated_at = now() WHERE org_id = %s AND id::text = %s RETURNING *",
                (*values, org_id, opportunity_id),
            )
            updated = rows(cur)
        if not updated:
            raise HTTPException(404, f"Opportunity {opportunity_id} not found")
        audit(conn, "opportunity_updated", user.user_id, {"opportunity_id": opportunity_id})
    return _opportunity_out(updated[0])


@router.delete("/opportunities/{opportunity_id}")
async def delete_opportunity(opportunity_id: str, user: AuthContext = Depends(require_roles("teacher", "admin"))):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute("DELETE FROM opportunities WHERE org_id = %s AND id::text = %s RETURNING id", (org_id, opportunity_id))
            deleted = cur.fetchall()
        if not deleted:
            raise HTTPException(404, f"Opportunity {opportunity_id} not found")
        audit(conn, "opportunity_deleted", user.user_id, {"opportunity_id": opportunity_id})
    return {"deleted": opportunity_id}


# ── Privacy (data export / deletion) ──────────────────────────────────────────

@router.get("/me/export")
async def export_my_data(user: AuthContext = Depends(require_user)):
    with db() as conn:
        org_id = get_org_id(conn, user)
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM participants WHERE org_id = %s", (org_id,))
            participants = rows(cur)
            cur.execute("SELECT * FROM opportunities WHERE org_id = %s", (org_id,))
            opportunities = rows(cur)
        audit(conn, "account_data_exported", user.user_id)
    return json_ready({
        "exported_at": datetime.utcnow().isoformat(),
        "user_id": user.user_id,
        "participants": participants,
        "opportunities": opportunities,
    })


@router.delete("/me")
async def delete_my_data(user: AuthContext = Depends(require_user)):
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM organizations WHERE owner_id = %s RETURNING id", (user.user_id,))
            deleted = cur.fetchall()
        audit(conn, "account_data_deleted", user.user_id, {"organizations": len(deleted)})
    return {"deleted": True,
            "message": "Stored Studentlytics application data was deleted. Clerk identity deletion is separate."}


def json_ready(value: Any) -> Any:
    """Recursively convert DB types (datetime, UUID, Decimal) for JSON responses."""
    import decimal
    import uuid as uuid_mod
    if isinstance(value, dict):
        return {k: json_ready(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_ready(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, uuid_mod.UUID):
        return str(value)
    if isinstance(value, decimal.Decimal):
        return float(value)
    return value


app.include_router(router)
