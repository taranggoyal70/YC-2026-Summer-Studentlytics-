# Managed Postgres + object storage, split deployment

The backend stored rosters in `students.json`, opportunities in `opportunities.json`, analysis jobs in an in-memory dict, and face templates in `face_encodings.json` on local disk — state that cannot survive a redeploy, a second worker, or any cloud host. We replace file/SQLite storage with managed Postgres (organizations, spaces, sessions, participants, rosters, recordings, analysis jobs, presence windows) and S3-compatible object storage for recordings and enrollment photos. Deployment is split: the Vite frontend stays on Vercel; the FastAPI backend deploys as a container on a long-running host (Railway/Fly/Render class), because face recognition (dlib) and Whisper transcription need CPU, long execution, and model weights that serverless functions cannot provide — and ADR-0001 requires biometric processing to stay in a customer-controlled environment rather than a cloud biometric API.

**Status**: accepted

**Considered Options**: Keep JSON-file storage; move everything to Vercel Functions; rewrite processing against AWS Rekognition; Postgres + object storage with a containerized backend.

**Consequences**: Two deploy targets and a CORS/env contract between them (`VITE_API_ENDPOINT`, `FRONTEND_ORIGINS`, `CLERK_ISSUER`/`CLERK_JWKS_URL`, `DATABASE_URL`, object-storage credentials). Analysis jobs become database rows with a worker process, so job state survives restarts and can scale past one worker. The unused `aws-config.ts` (S3/Rekognition/Lambda names no code calls) is removed as contradicting ADR-0001.
