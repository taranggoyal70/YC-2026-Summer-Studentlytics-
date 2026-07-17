"""
Studentlytics analysis worker — runs in GitHub Actions (see .github/workflows/analyze.yml).

All biometric processing happens here, in a customer-controlled environment
(ADR-0001, ADR-0005): face-template enrollment from photos, face matching in
recordings, Whisper transcription, engagement scoring. Reads and writes Neon
Postgres; downloads media from Vercel Blob URLs.

Usage: python worker/analyze.py --job-id <analysis_job_uuid>
"""

import argparse
import json
import logging
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import face_recognition
import psycopg2
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("studentlytics.worker")

MATCH_TOLERANCE = 0.6
PRESENCE_ATTENDED_RATIO = 0.2
CAMERA_OFF_WORD_THRESHOLD = 50


def db_connect():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def fetch_rows(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def set_job(conn, job_id, **fields):
    sets = ", ".join(f"{k} = %s" for k in fields)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE analysis_jobs SET {sets}, updated_at = now() WHERE id = %s",
            (*[json.dumps(v) if k == "result" else v for k, v in fields.items()], job_id),
        )
    conn.commit()


def download(url: str, dest: Path):
    req = urllib.request.Request(url, headers={"User-Agent": "studentlytics-worker"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)


# ── Face template enrollment ───────────────────────────────────────────────────

def ensure_face_templates(conn, org_id: str) -> dict:
    """Encode enrollment photos for participants lacking a face template,
    then return {participant_id: {name, external_id, encodings[np.array]}}."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT p.id, p.name, p.external_id, p.photo_url, ft.encodings
               FROM participants p LEFT JOIN face_templates ft ON ft.participant_id = p.id
               WHERE p.org_id = %s""",
            (org_id,),
        )
        participants = fetch_rows(cur)

    templates = {}
    for p in participants:
        pid = str(p["id"])
        if p["encodings"]:
            templates[pid] = {
                "name": p["name"],
                "external_id": p["external_id"],
                "encodings": [np.array(e) for e in p["encodings"]],
            }
            continue
        if not p["photo_url"]:
            continue
        try:
            with tempfile.NamedTemporaryFile(suffix=".img", delete=False) as tmp:
                photo_path = Path(tmp.name)
            download(p["photo_url"], photo_path)
            img = cv2.imread(str(photo_path))
            photo_path.unlink(missing_ok=True)
            if img is None:
                logger.warning("Could not decode photo for %s", p["name"])
                continue
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            locs = face_recognition.face_locations(rgb, model="hog")
            if not locs:
                logger.warning("No face found in photo for %s", p["name"])
                continue
            encoding = face_recognition.face_encodings(rgb, locs)[0]
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO face_templates (participant_id, encodings, photos_enrolled)
                       VALUES (%s, %s, 1)
                       ON CONFLICT (participant_id)
                       DO UPDATE SET encodings = EXCLUDED.encodings, updated_at = now()""",
                    (pid, json.dumps([encoding.tolist()])),
                )
            conn.commit()
            templates[pid] = {"name": p["name"], "external_id": p["external_id"], "encodings": [encoding]}
            logger.info("Enrolled face template for %s", p["name"])
        except Exception:
            logger.exception("Face enrollment failed for %s", p["name"])
    return templates


# ── Audio ──────────────────────────────────────────────────────────────────────

def transcribe_video(video_path: Path) -> list:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(video_path), "-ac", "1", "-ar", "16000", "-vn", audio_path],
            check=True, capture_output=True,
        )
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        segs, _ = model.transcribe(audio_path, beam_size=1, vad_filter=True)
        return [
            {"start": float(s.start), "end": float(s.end), "text": s.text.strip()}
            for s in segs if s.text.strip()
        ]
    finally:
        Path(audio_path).unlink(missing_ok=True)


def attribute_speech(segments, face_windows, names):
    stats = {
        pid: {"name": names.get(pid, pid), "word_count": 0, "questions_asked": 0}
        for pid in face_windows
    }
    camera_off_segments = []
    total_camera_time = {pid: sum(e - s for s, e in ws) for pid, ws in face_windows.items()}

    for seg in segments:
        start, end, text = seg["start"], seg["end"], seg["text"]
        mid = (start + end) / 2
        words = len(text.split())
        is_question = "?" in text
        visible = [pid for pid, ws in face_windows.items() if any(s <= mid <= e for s, e in ws)]
        if not visible:
            camera_off_segments.append(seg)
        elif len(visible) == 1:
            pid = visible[0]
            stats[pid]["word_count"] += words
            if is_question:
                stats[pid]["questions_asked"] += 1
        else:
            visible_total = sum(total_camera_time.get(p, 0) for p in visible) or 1.0
            best = max(visible, key=lambda p: total_camera_time.get(p, 0))
            for pid in visible:
                stats[pid]["word_count"] += round(words * total_camera_time.get(pid, 0) / visible_total)
            if is_question:
                stats[best]["questions_asked"] += 1

    return {
        "per_participant": stats,
        "camera_off": {
            "segment_count": len(camera_off_segments),
            "word_count": sum(len(s["text"].split()) for s in camera_off_segments),
            "segments": camera_off_segments[:10],
        },
    }


# ── Presence ───────────────────────────────────────────────────────────────────

def merge_windows(windows, max_gap=6.0):
    ordered = sorted((max(0.0, s), max(0.0, e)) for s, e in windows if e > s)
    if not ordered:
        return []
    merged = [ordered[0]]
    for s, e in ordered[1:]:
        ls, le = merged[-1]
        if s - le <= max_gap:
            merged[-1] = (ls, max(le, e))
        else:
            merged.append((s, e))
    return merged


def decide_status(merged, duration_sec, attended, camera_on, word_count):
    """Map presence evidence to the CONTEXT.md attendance-decision statuses."""
    if not attended:
        if not camera_on and word_count > CAMERA_OFF_WORD_THRESHOLD:
            return "camera_off_present"
        return "absent"
    first_seen = merged[0][0] if merged else 0
    last_seen = merged[-1][1] if merged else 0
    late_threshold = max(300, duration_sec * 0.1)
    early_threshold = max(300, duration_sec * 0.1)
    if last_seen < max(0, duration_sec - early_threshold):
        return "left_early"
    if first_seen > late_threshold:
        return "late"
    return "present"


# ── Main processing ────────────────────────────────────────────────────────────

def process(job_id: str):
    conn = db_connect()
    with conn.cursor() as cur:
        cur.execute(
            """SELECT aj.id, aj.session_id, r.blob_url, s.title, sp.org_id
               FROM analysis_jobs aj
               JOIN recordings r ON r.id = aj.recording_id
               JOIN sessions s ON s.id = aj.session_id
               JOIN spaces sp ON sp.id = s.space_id
               WHERE aj.id = %s""",
            (job_id,),
        )
        jobs = fetch_rows(cur)
    if not jobs:
        logger.error("Job %s not found", job_id)
        sys.exit(1)
    job = jobs[0]
    session_id, org_id = str(job["session_id"]), str(job["org_id"])
    run_id = os.getenv("GITHUB_RUN_ID")

    set_job(conn, job_id, status="processing", progress=5, workflow_run_id=run_id)
    start_time = time.time()

    try:
        templates = ensure_face_templates(conn, org_id)
        if not templates:
            raise RuntimeError("No participants with enrolled face templates or photos. Enroll photos first.")
        set_job(conn, job_id, progress=10)

        video_path = Path(tempfile.mkdtemp()) / "recording.mp4"
        download(job["blob_url"], video_path)
        logger.info("Recording downloaded: %.1f MB", video_path.stat().st_size / 1e6)
        set_job(conn, job_id, progress=15)

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError("Could not open video file")
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_sec = total_frames / fps
        sample_interval = max(1, int(fps * 2))
        video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        detect_scale = 1.0 if video_width <= 720 else (0.5 if video_width <= 1280 else 0.25)

        audio_result, audio_error = [None], [None]

        def _run_transcription():
            try:
                audio_result[0] = transcribe_video(video_path)
            except Exception as e:
                audio_error[0] = str(e)

        audio_thread = threading.Thread(target=_run_transcription, daemon=True)
        audio_thread.start()

        presence_scores = {}
        face_windows = {}
        window_start = {}
        total_sampled = 0
        unknown_per_frame = []
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % sample_interval != 0:
                frame_idx += 1
                continue
            progress = 15 + min(70, int((frame_idx / max(total_frames, 1)) * 70))
            if total_sampled % 20 == 0:
                set_job(conn, job_id, progress=progress)

            detect_frame = frame if detect_scale == 1.0 else cv2.resize(frame, (0, 0), fx=detect_scale, fy=detect_scale)
            rgb_detect = cv2.cvtColor(detect_frame, cv2.COLOR_BGR2RGB)
            face_locs = face_recognition.face_locations(rgb_detect, model="hog")
            if not face_locs:
                total_sampled += 1
                frame_idx += 1
                continue

            inv = 1.0 / detect_scale
            face_locs_full = [(int(t * inv), int(r * inv), int(b * inv), int(l * inv)) for t, r, b, l in face_locs]
            rgb_full = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            encodings_in_frame = face_recognition.face_encodings(rgb_full, face_locs_full)

            unknowns = 0
            present_now = set()
            for enc, loc in zip(encodings_in_frame, face_locs):
                matched, best = None, MATCH_TOLERANCE
                for pid, tdata in templates.items():
                    distances = face_recognition.face_distance(tdata["encodings"], enc)
                    dist = float(np.min(distances))
                    if dist < best:
                        best, matched = dist, pid
                if matched and matched not in present_now:
                    present_now.add(matched)
                    top, right, bottom, left = loc
                    face_height = (bottom - top) * (1.0 / detect_scale)
                    visual = min(1.0, (face_height / frame.shape[0]) * 5)
                    confidence = (MATCH_TOLERANCE - best) / MATCH_TOLERANCE
                    presence_scores.setdefault(matched, []).append(min(1.0, visual * 0.6 + confidence * 0.4))
                    if matched not in window_start:
                        window_start[matched] = frame_idx / fps
                else:
                    unknowns += 1

            current_sec = frame_idx / fps
            for pid in list(window_start):
                if pid not in present_now:
                    face_windows.setdefault(pid, []).append((window_start.pop(pid), current_sec))
            unknown_per_frame.append(unknowns)
            total_sampled += 1
            frame_idx += 1

        for pid, ws in window_start.items():
            face_windows.setdefault(pid, []).append((ws, duration_sec))
        cap.release()
        set_job(conn, job_id, progress=88)

        audio_thread.join()
        if audio_error[0]:
            logger.warning("Audio failed: %s", audio_error[0])
            segments = []
            audio_data = {"per_participant": {}, "camera_off": {"segment_count": 0, "word_count": 0, "segments": []}}
        else:
            segments = audio_result[0]
            names = {pid: t["name"] for pid, t in templates.items()}
            audio_data = attribute_speech(segments, face_windows, names)

        # ── Decisions ──────────────────────────────────────────────────────────
        word_counts = {pid: audio_data["per_participant"].get(pid, {}).get("word_count", 0) for pid in templates}
        max_words = max(word_counts.values()) if word_counts else 1
        decisions = []
        all_windows = []

        for pid, tdata in templates.items():
            stats = audio_data["per_participant"].get(pid, {})
            word_count = stats.get("word_count", 0)
            questions = stats.get("questions_asked", 0)
            merged = merge_windows(face_windows.get(pid, []))
            scores = presence_scores.get(pid, [])
            presence_ratio = len(scores) / max(total_sampled, 1)
            camera_on = bool(scores)
            attended = presence_ratio >= PRESENCE_ATTENDED_RATIO
            status = decide_status(merged, duration_sec, attended, camera_on, word_count)

            engagement = None
            breakdown = None
            if status in ("present", "late", "left_early"):
                visual = float(np.mean(scores)) * 0.35 if scores else 0
                participation = (word_count / max(max_words, 1)) * 0.35
                interaction = min(0.20, questions * 0.05)
                consistency = 0.02 if (word_count == 0 and presence_ratio > 0.5) else min(0.10, presence_ratio * 0.10)
                engagement = round((visual + participation + interaction + consistency) * 100, 1)
                breakdown = {
                    "visual": round(visual * 100, 1),
                    "participation": round(participation * 100, 1),
                    "interaction": round(interaction * 100, 1),
                    "consistency": round(consistency * 100, 1),
                }
            elif status == "camera_off_present":
                participation = (word_count / max(max_words, 1)) * 0.35
                interaction = min(0.20, questions * 0.05)
                engagement = round((participation + interaction + 0.05) * 100, 1)
                breakdown = {
                    "visual": 0.0,
                    "participation": round(participation * 100, 1),
                    "interaction": round(interaction * 100, 1),
                    "consistency": 5.0,
                }

            decisions.append({
                "participant_id": pid,
                "status": status,
                "confidence": round(presence_ratio, 3),
                "check_in_seconds": merged[0][0] if merged else None,
                "check_out_seconds": merged[-1][1] if merged else None,
                "duration_present_seconds": round(sum(e - s for s, e in merged), 1),
                "left_early": status == "left_early",
                "returned_after_leave": len(merged) > 1,
                "camera_on": camera_on,
                "word_count": word_count,
                "questions_asked": questions,
                "engagement_score": engagement,
                "engagement_breakdown": breakdown,
            })
            all_windows.extend((pid, s, e) for s, e in merged)

        attended_decisions = [d for d in decisions if d["status"] in ("present", "late", "left_early", "camera_off_present")]
        engaged = [d["engagement_score"] for d in attended_decisions if d["engagement_score"] is not None]
        result = {
            "processed_at": datetime.utcnow().isoformat(),
            "duration_seconds": round(duration_sec, 1),
            "processing_time_seconds": round(time.time() - start_time, 1),
            "frames_sampled": total_sampled,
            "enrolled_participants": len(templates),
            "attendance": {
                "count": len(attended_decisions),
                "total": len(templates),
                "rate": round(len(attended_decisions) / max(len(templates), 1) * 100, 1),
            },
            "engagement": {
                "average_score": round(float(np.mean(engaged)), 1) if engaged else 0.0,
                "at_risk_count": sum(1 for e in engaged if e < 50),
            },
            "audio": {
                "transcript_segments": len(segments),
                "camera_off_word_count": audio_data["camera_off"]["word_count"],
            },
        }

        # ── Persist ────────────────────────────────────────────────────────────
        with conn.cursor() as cur:
            cur.execute("DELETE FROM presence_windows WHERE job_id = %s", (job_id,))
            cur.execute("DELETE FROM attendance_decisions WHERE job_id = %s", (job_id,))
            for pid, s, e in all_windows:
                cur.execute(
                    "INSERT INTO presence_windows (job_id, participant_id, start_seconds, end_seconds) VALUES (%s, %s, %s, %s)",
                    (job_id, pid, s, e),
                )
            for d in decisions:
                cur.execute(
                    """INSERT INTO attendance_decisions
                       (job_id, session_id, participant_id, status, confidence, check_in_seconds,
                        check_out_seconds, duration_present_seconds, left_early, returned_after_leave,
                        camera_on, word_count, questions_asked, engagement_score, engagement_breakdown)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (job_id, session_id, d["participant_id"], d["status"], d["confidence"],
                     d["check_in_seconds"], d["check_out_seconds"], d["duration_present_seconds"],
                     d["left_early"], d["returned_after_leave"], d["camera_on"], d["word_count"],
                     d["questions_asked"], d["engagement_score"],
                     json.dumps(d["engagement_breakdown"]) if d["engagement_breakdown"] else None),
                )
            cur.execute("UPDATE sessions SET status = 'completed' WHERE id = %s", (session_id,))
        conn.commit()
        set_job(conn, job_id, status="completed", progress=100, result=result)
        logger.info("Job %s completed: %s/%s attended", job_id, len(attended_decisions), len(templates))
    except Exception as e:
        logger.exception("Job %s failed", job_id)
        set_job(conn, job_id, status="failed", error=str(e)[:2000])
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    process(parser.parse_args().job_id)
