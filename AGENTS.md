# Agent Instructions

- Before editing any file, read it first.
- Before modifying a function, grep for all callers.
- Research before editing.
- Run the project linter or type-checker before writing code.
- After every 2-3 edited files, run the linter or type-checker again.
- Do not retry a failed command without reading the full error first.
- Do not retry any single fix more than twice.
- Treat retries as expensive. Prefer stopping with the exact blocker over speculative reruns.
- If environment variables or dependencies are missing, stop and tell the user.
- Do not guess secrets, project IDs, or deployment config values.
- Prefer direct work over sub-agents unless the task is truly independent and parallelizable.
- Keep responses short.
