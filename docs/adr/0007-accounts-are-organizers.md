# Accounts are organizers; participants are roster records, not accounts

Supersedes ADR-0006. The student/teacher signup split was legacy from the old student-portal design and
incoherent under per-owner tenancy: a "student" account created its own empty organization with no link to
any participant row in an organizer's roster — the user saw nothing and could do nothing. Now every sign-up
is an Organizer (role `teacher`; `admin` remains manual), stamped into Clerk `public_metadata` on first
`/api/me`. People being tracked are Participants — roster records created by organizers and matched by face
recognition — and they do not have logins.

**Status**: accepted (supersedes ADR-0006)

**Considered Options**: Keep dual signup with a student portal; link student accounts to participant rows by
email; organizer-only accounts.

**Consequences**: The participant self-view ("see my own attendance") from the platform blueprint becomes an
invite-based roadmap feature that links an invited login to an existing participant row — not a signup path.
The `student` role value stays in the backend enum for token compatibility but nothing issues it.
