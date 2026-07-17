# Security Rules

These are mandatory engineering rules for Studentlytics.

## Authentication and Authorization

- Clerk is the system of record for user sessions.
- Frontend route access must use Clerk session state, not localStorage.
- Backend APIs must verify Clerk JWTs before returning user data.
- Staff-only operations require `teacher` or `admin`.
- Every mutable application resource must include an `owner_id`.
- A user can read, update, or delete only resources they own unless they are `admin`.

## Data Protection

- No secret keys may be exposed through Vite `VITE_` variables.
- Sensitive backend keys belong only in backend or hosting environment variables.
- API payloads must use whitelist schemas with extra fields forbidden.
- Stored string data must be sanitized before persistence.
- SQL use must be parameterized. Future Postgres tables must enable Row Level Security.

## User Data

- Store the minimum user profile data needed for the feature.
- Privacy defaults should be restrictive.
- Password handling belongs to Clerk, not Studentlytics.
- Users must be able to export stored app data.
- Users must be able to delete or anonymize stored app data.

## Error Handling and Logging

- Client responses must not expose stack traces, local paths, raw exceptions, or database internals.
- Authentication errors must stay generic.
- Security events such as rate limits, data export, deletion, and resource changes must be timestamped.

## API and Network

- All production traffic must use HTTPS.
- CORS must list trusted origins explicitly.
- API routes must be rate-limited.
- Security headers must include CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.

## Verification

- Security changes require a corresponding unit or API test.
- Environment files with real values must remain out of git.
