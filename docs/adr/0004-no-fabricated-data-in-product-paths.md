# No fabricated data in product code paths

Pages repeatedly shipped hand-written arrays of plausible students (`semesterData.ts`, `transformStudents.ts` exporting them as `realStudents`) and status docs then described them as "real data." Every product surface must render only API data; empty states are the honest default when an organization has no sessions yet. Demo content is allowed only as an explicit, clearly-labeled seed script that writes through the real API into a demo organization.

**Status**: accepted

**Considered Options**: Keep polished fake data for demos; feature-flagged mock mode in the frontend; API-only rendering with a seed script.

**Consequences**: Dashboards look empty until real data exists — that is correct, not a bug to "fix" with mock arrays. Any file exporting fabricated domain records is a defect. Sales demos use the seeded demo organization, which exercises the same end-to-end path as customers.
