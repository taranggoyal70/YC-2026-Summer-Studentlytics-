# Clerk is the sole identity provider

The repo carried two authentication stacks: a legacy self-hosted one (SQLite `users.db`, SHA-256 + salt, custom JWTs in `backend/auth.py` / `main_auth.py`) and Clerk (frontend `ClerkProvider` + backend JWKS verification in `security.py`). Two identity systems means two user stores and an ambiguous owner for `user_id` on every resource. We keep Clerk — it is already wired end-to-end, env-driven, and handles sessions, MFA, and CAPTCHA — and delete the legacy stack.

**Status**: accepted

**Considered Options**: Keep self-hosted SQLite auth; run both side by side; Clerk only.

**Consequences**: User identity carries vendor lock-in to Clerk; roles live in Clerk `publicMetadata.role`. The backend must never trust a role claim without verifying the token against Clerk's JWKS. `backend/auth.py`, `backend/main_auth.py`, and `backend/data/users.db` are dead and must be removed.
