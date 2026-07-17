# API on Vercel Functions, analysis worker on GitHub Actions

Supersedes the deployment half of ADR-0003 (Postgres + object storage stand). No container-host account
(Railway/Fly/Render) was available, and provisioning one could not be done with existing credentials. The
resources that DO exist — Vercel (project + Neon Postgres + Blob via Marketplace) and GitHub — cover the
whole architecture: the FastAPI CRUD/reporting API runs as a Vercel Python function in the same project as
the frontend (`/api/*`), browsers upload recordings directly to Vercel Blob via client-upload tokens
(function bodies cap at 4.5 MB), and each Analysis Job dispatches a `workflow_dispatch` run of
`.github/workflows/analyze.yml`, where dlib face recognition and Whisper run on a GitHub-hosted runner and
write presence windows and attendance decisions straight to Postgres.

**Status**: accepted (supersedes ADR-0003 deployment choice)

**Considered Options**: Containerized backend on a new host account; all-Vercel including biometrics
(impossible — dlib/Whisper exceed serverless limits); Vercel Functions API + GitHub Actions worker.

**Consequences**: Analysis latency includes Actions queue + dependency install (several minutes on cold
cache) — acceptable for recordings-first processing (ADR-0001), not for future live monitoring, which will
need a persistent worker. The GitHub token used for dispatch (`GH_DISPATCH_TOKEN`) and `DATABASE_URL` (repo
secret) are the trust boundary between the two halves. Job state lives in `analysis_jobs` rows, so a lost
runner can be re-dispatched idempotently (worker deletes and rewrites its own job's decisions).
