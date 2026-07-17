-- Studentlytics schema. Nouns follow CONTEXT.md:
-- Organization → Space → Session → Recording → Analysis Job → Presence Windows → Attendance Decision.
-- Applied to Neon Postgres; idempotent so it can re-run safely.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,             -- Clerk user id of the creator
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'class', -- class | training | webinar | event-track | cohort
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  location TEXT,
  kind TEXT NOT NULL DEFAULT 'virtual',      -- virtual | in-person
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | completed | cancelled
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,          -- e.g. student id, employee id
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  major TEXT,
  department TEXT,
  cohort TEXT,
  photo_url TEXT,                     -- enrollment photo in Blob storage
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, external_id)
);

CREATE TABLE IF NOT EXISTS roster_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  consent_status TEXT NOT NULL DEFAULT 'pending',  -- pending | granted | declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (space_id, participant_id)
);

-- Biometric template. One row per participant; consent-scoped; never exported.
CREATE TABLE IF NOT EXISTS face_templates (
  participant_id UUID PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  encodings JSONB NOT NULL,           -- list of 128-d face encodings
  photos_enrolled INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  blob_url TEXT NOT NULL,
  filename TEXT,
  size_mb REAL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | processing | completed | failed
  progress INT NOT NULL DEFAULT 0,
  error TEXT,
  workflow_run_id TEXT,               -- GitHub Actions run that processed this job
  result JSONB,                       -- summary metrics (counts, rates, engagement averages)
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS presence_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  status TEXT NOT NULL,               -- present | camera_off_present | late | left_early | absent | unknown
  confidence REAL,
  check_in_seconds REAL,
  check_out_seconds REAL,
  duration_present_seconds REAL,
  left_early BOOLEAN NOT NULL DEFAULT FALSE,
  returned_after_leave BOOLEAN NOT NULL DEFAULT FALSE,
  camera_on BOOLEAN NOT NULL DEFAULT TRUE,
  word_count INT NOT NULL DEFAULT 0,
  questions_asked INT NOT NULL DEFAULT 0,
  engagement_score REAL,
  engagement_breakdown JSONB,
  UNIQUE (job_id, participant_id)
);

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  type TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  location TEXT NOT NULL,
  pay TEXT,
  duration TEXT,
  spots INT,
  students INT,
  deadline TEXT,
  status TEXT,
  is_paid BOOLEAN,
  description TEXT,
  owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event TEXT NOT NULL,
  actor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spaces_org ON spaces(org_id);
CREATE INDEX IF NOT EXISTS idx_sessions_space ON sessions(space_id);
CREATE INDEX IF NOT EXISTS idx_participants_org ON participants(org_id);
CREATE INDEX IF NOT EXISTS idx_roster_space ON roster_entries(space_id);
CREATE INDEX IF NOT EXISTS idx_recordings_session ON recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_jobs_session ON analysis_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_windows_job ON presence_windows(job_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session ON attendance_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_org ON opportunities(org_id);
