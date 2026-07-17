# Studentlytics Context

Studentlytics is a presence intelligence product for sessions where people gather to learn, train, attend, or present. The language below keeps the product from drifting into a narrow course-management app.

## Language

**Organization**:
A university, company, conference team, or event operator that owns spaces, sessions, participants, reports, and data-retention policy.
_Avoid_: Account, tenant, client

**Space**:
A grouping of sessions inside an organization, such as a class, training program, event track, department, webinar series, or cohort.
_Avoid_: Course when the context is not specifically academic

**Session**:
One scheduled gathering where attendance and engagement can be measured, such as a class meeting, webinar, conference talk, workshop, or company training block.
_Avoid_: Class as the default term

**Participant**:
A person expected or allowed to attend a session. A participant may be a student, employee, attendee, learner, guest, speaker, instructor, or organizer depending on the space.
_Avoid_: Student as the default term

**Roster**:
The set of participants expected for a space or session, including identity, consent status, and enrollment relationship.
_Avoid_: Student list

**Recording**:
A captured video or meeting export used as evidence for a session analysis.
_Avoid_: Course video, lecture file

**Analysis Job**:
A processing run for a recording or live stream that produces attendance, presence, engagement, and evidence outputs for a session.
_Avoid_: Upload as the whole concept

**Presence Window**:
One continuous interval where a participant is verified as present in a session. A participant can have multiple presence windows if they leave and return.
_Avoid_: Single check-in/check-out pair when re-entry is possible

**Attendance Decision**:
The interpreted attendance status for a participant in a session, such as present, absent, late, left early, camera-off present, or unknown.
_Avoid_: Raw face match as the decision

**Engagement Score**:
An explainable score derived from attendance evidence, visual presence, participation, interaction, consistency, and confidence. It is a signal for review, not a standalone high-stakes judgment.
_Avoid_: Focus score, performance score

**Evidence**:
The observable facts behind an attendance decision or engagement score, such as first seen, last seen, duration, words spoken, questions asked, confidence, and presence windows.
_Avoid_: Black-box AI result

**Face Template**:
The stored biometric encoding derived from a participant's enrollment photo, used only to verify presence in sessions the participant consented to. It is sensitive personal data, never demo content, and never belongs in version control.
_Avoid_: Face encoding file, extracted face

## Flagged Ambiguities

**Course vs Space**:
Use **Space** in core product language because Studentlytics supports universities, companies, conferences, webinars, and events. Use **course** only when a customer is specifically academic.

**Student vs Participant**:
Use **Participant** in core product language because the same product tracks students, employees, attendees, guests, and speakers. Use **student** only in school-specific examples.

**Attendance vs Presence**:
Use **Presence Window** for raw time intervals and **Attendance Decision** for the interpreted status shown in reports. Check-in and check-out are derived from the first and last presence window, never stored as the primitive.

**Real Data vs Demo Data**:
**Real data** is data created through the product by authenticated users or produced by an analysis job. Hand-written arrays of plausible names are **demo data** no matter how realistic they look, and must never be labeled real. Demo data lives only in seed scripts, never in product code paths.

## Example Dialogue

Organizer: "I uploaded the recording for yesterday's onboarding session."

Developer: "That creates an analysis job for the session. The report should show each participant's attendance decision and the evidence behind it."

Organizer: "One person joined, left after 20 minutes, then came back near the end."

Developer: "That is one participant with multiple presence windows. The attendance decision may still be present, but the report should also flag the early departure and re-entry."

Organizer: "Can this work for a university class too?"

Developer: "Yes. A class is just one kind of space, and students are one kind of participant."
