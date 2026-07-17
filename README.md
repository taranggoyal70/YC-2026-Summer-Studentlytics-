# Studentlytics

**AI-powered attendance, engagement, and check-in/check-out tracking for classrooms, webinars, conferences, and company training.**

Upload a classroom, webinar, conference, or training recording. Get per-person attendance, engagement scores, participation data, and session timelines automatically.

---

## What It Does

Studentlytics processes session recordings using face recognition and audio transcription to produce:

- **Attendance records** — who was present, confirmed by face recognition (95%+ accuracy)
- **Check-in/check-out timelines** — first seen, last seen, total visible time, and early-leave detection
- **Engagement scores** — multi-factor score per student: visual presence + verbal participation + interaction quality + consistency
- **Participation data** — words spoken, questions asked, camera-on time per student
- **Camera-off detection** — students speaking with camera off are marked present, not absent
- **At-risk alerts** — participants who attend but never participate, arrive late, or leave early are flagged

Processing a 60-minute class recording takes ~15 minutes. No cloud APIs. $0/video processing cost.

---

## The Problem

Universities, companies, and event teams still rely on manual roll calls, meeting attendance exports, badge scans, or memory. Those methods miss the real story: who arrived late, who left early, who was camera-off but participating, and who attended without engaging.

The data already exists in session recordings and live calls. Studentlytics makes it actionable.

---

## Architecture

```
Session Recording (MP4/MOV/WebM/Zoom/Meet export)
         │
         ▼
┌─────────────────────────────────┐
│      FastAPI Backend            │
│  (customer-controlled runtime) │
│                                 │
│  ┌──────────────┐  ┌─────────┐  │
│  │ Face         │  │ Audio   │  │  ← runs in parallel
│  │ Recognition  │  │ Whisper │  │
│  │ (dlib HOG)   │  │ (tiny)  │  │
│  └──────────────┘  └─────────┘  │
│         │               │       │
│         └───────┬───────┘       │
│                 ▼               │
│      Engagement Scoring         │
│   visual(35%) + speech(35%)     │
│   + interaction(20%)            │
│   + consistency(10%)            │
└─────────────────────────────────┘
         │
         ▼
   React Dashboard
   (attendance, engagement, timelines)
```

**No student biometric data ever leaves the institution's network.** All face encodings and video processing run locally. FERPA and BIPA compliant by architecture.

---

## Key Technical Decisions

| Decision | Why |
|---|---|
| Local dlib (not AWS Rekognition) | $0/video vs ~$6-8/video at scale. No biometric data in cloud. FERPA/BIPA compliant. |
| faster-whisper tiny + int8 | 4-8x faster than openai-whisper on CPU. Good enough for participation tracking. |
| Parallel audio thread | Audio transcription runs concurrently with face processing → 40% faster total processing |
| Adaptive detection scale | Full-res for ≤720px video (virtual meetings). 0.5x for 1280px. Prevents missing faces in small grid-view tiles. |
| Proportional speech attribution | Grid meetings (multiple faces visible) → speech distributed by each student's camera-on time fraction |
| Presence timeline extraction | First seen, last seen, visible duration, left-early flag, and multiple presence windows are emitted per participant. |
| 20% presence threshold | Participant marked present if detected in ≥20% of sampled frames. Handles momentary frame drops. |

---

## Engagement Score Formula

```
visual        = (face_size / frame_height × 5) × match_confidence  [35%]
participation = words_spoken / max_words_in_class                   [35%]
interaction   = min(1.0, questions_asked × 0.05 / 0.2)             [20%]
consistency   = 0.02 if (camera_on AND zero words)                  [10%]
              = min(1.0, presence_ratio)                            [10%]

engagement_score = (visual + participation + interaction + consistency) × 100
```

Camera-off participants who speak >50 words are marked `present_camera_off` with a reduced score (no visual component).

## Platform Blueprint

See [docs/PLATFORM_BLUEPRINT.md](./docs/PLATFORM_BLUEPRINT.md) for the broader product architecture: classrooms, live calls, webinars, conferences, company training, participant timelines, consent, and the live-session roadmap.

---

## Architecture

Everything runs in the cloud — nothing is hardcoded or local (see ADRs 0002–0005):

- **Frontend + API**: one Vercel project. Vite SPA plus FastAPI on Vercel Python Functions under `/api/*` (`api/index.py`).
- **Database**: Neon Postgres (Vercel Marketplace) — organizations, spaces, sessions, participants, rosters, recordings, analysis jobs, presence windows, attendance decisions.
- **Media**: Vercel Blob. Browsers upload recordings directly with client-upload tokens issued by `api/upload.js`.
- **Analysis worker**: `.github/workflows/analyze.yml` runs `worker/analyze.py` on GitHub Actions per analysis job — face-template enrollment, face matching, Whisper transcription, engagement scoring — and writes results to Postgres.
- **Auth**: Clerk. The backend verifies JWTs against Clerk's JWKS; the `studentlytics` JWT template embeds the user's role.

Production: https://studentlytics-app.vercel.app

## Getting Started (local development)

```bash
npm install
vercel env pull .env.local   # DATABASE_URL, Clerk keys, Blob token
npm run dev
```

The `/api` routes run on Vercel; for local iteration use `vercel dev`. Apply schema changes with `db/schema.sql` (idempotent).

### Enroll Participants

1. Go to **People** → add a participant → upload a clear headshot photo
2. The photo is stored in Blob; the face template is computed by the worker with the next analysis run

### Process a Recording

1. Go to **Sessions** → **Upload Recording**
2. Upload an MP4/MOV/WebM file — it goes straight to Blob storage
3. An analysis job is dispatched to the GitHub Actions worker (first run takes longer while dlib builds)
4. Attendance decisions, presence windows, and engagement evidence appear in Attendance and Analytics

---

## API Reference

```
GET  /api/health                        Service status
GET  /api/me                            Current user, role, organization

GET|POST /api/students                  Participants (legacy route name)
PUT|DELETE /api/students/records/{id}   Update / delete participant
POST /api/students/records/{id}/photo   Attach enrollment photo (Blob URL)
GET  /api/students/enrolled             Participants with face templates

GET|POST /api/sessions                  Sessions
GET  /api/sessions/{id}/report          Attendance decisions + presence windows

POST /api/upload                        Blob client-upload token (staff only)
POST /api/videos/register               Register recording + dispatch analysis
GET  /api/videos                        List analysis jobs
GET  /api/videos/{id}/status            Poll one analysis job

GET  /api/analytics/overview            Org-level attendance/engagement stats
GET  /api/analytics/leaderboard         Per-participant stats
GET|POST /api/opportunities             Opportunities CRUD
```

---

## Privacy & Compliance

All processing is local. See [YC_PRIVACY_COMPLIANCE.md](./YC_PRIVACY_COMPLIANCE.md) for:
- FERPA compliance approach
- BIPA consent framework
- GDPR data processing agreement template
- Student consent form template

---

## Stack

**Backend:** Python, FastAPI, dlib (face_recognition), faster-whisper, OpenCV, ffmpeg

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts, Framer Motion

**Infrastructure:** Runs entirely on-premise. No cloud dependencies for core processing.

---

## Roadmap

- [ ] LMS integration: Canvas, Blackboard, Google Classroom (attendance sync)
- [ ] Session timeline UI: check-in, check-out, visible duration, early leave, re-entry windows
- [ ] Live video stream support (RTSP / Zoom / Google Meet / Teams adapters)
- [ ] Organization and workspace model for universities, companies, and event teams
- [ ] Email alerts for at-risk students (configurable thresholds)
- [ ] Multi-session trend view per student
- [ ] Export to CSV / PDF for institutional reporting
- [ ] Consent management dashboard

---

## License

MIT
