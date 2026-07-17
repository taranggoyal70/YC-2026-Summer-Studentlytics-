# Self-serve organizer role, promoted server-side

Sign-ups choose student or organizer (teacher) themselves, and the backend promotes that choice from
client-writable `unsafe_metadata` into server-owned `public_metadata` on first `/api/me` — no invite flow, no
manual approval. This looks like self-granted privilege, but tenancy makes it safe: every user owns their own
organization and a teacher role grants power over nothing outside it. The backend never authorizes from
`unsafe_metadata` directly — only from the role claim in the verified JWT, which is sourced from
`public_metadata`. `admin` is never self-serve.

**Status**: superseded by ADR-0007

**Considered Options**: Invite-only organizer accounts; trusting `unsafeMetadata` directly in the API;
Clerk webhook-based promotion; first-touch promotion via `/api/me`.

**Consequences**: Anyone can run their own organization — intended for self-serve adoption. If shared
organizations (multiple staff in one org) arrive later, role becomes an org-membership property and this
per-identity promotion must be revisited. Webhook-based promotion was rejected to avoid a public webhook
endpoint and signing-secret setup for what one authenticated API call handles.
