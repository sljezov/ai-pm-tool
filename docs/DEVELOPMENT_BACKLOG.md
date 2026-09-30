# Development backlog

The backlog is ordered by dependency and evaluation risk. Each package establishes invariants required by the package below it; AI-assisted workflows are deliberately built only after their manual, persistent domain model exists.

| Order | Work package | Why it is here | Status |
| --- | --- | --- | --- |
| 1 | WP-00 — foundation and validation interface | Fixes the framework, scripts and test contract used by all later work. | Complete |
| 2 | WP-01 — projects and persistence | Establishes durable project identity and SQLite access before child data exists. | Complete |
| 3 | WP-02 — manual backlog and readiness | Proves core product value and domain rules without depending on AI. | Complete |
| 4 | WP-03 — mockups and history | Adds the safe structured visual model required by criteria and later proposals. | Complete |
| 5 | WP-04 — guided conversation | Introduces validated AI orchestration and recoverable conversation state. | Complete |
| 6 | WP-05 — roles, stories and priority | Converts guidance into reviewable proposals and explicit confirmations. | Complete |
| 7 | WP-06 — prototype proposal | Combines criteria and mockup application atomically for one selected story. | Complete |
| 8 | WP-07 — client refinements | Adds version-aware before/after changes while enforcing story isolation. | Complete |
| 9 | WP-08 — manual and AI grooming | Adds the highest-risk multi-story split/merge operations after undo and scope rules are mature. | Complete |
| 10 | WP-09 — recovery and hardening | Closes continuity, idempotency, accessibility, responsive UI and full-flow test gaps. | Complete |
| 11 | WP-10 — documentation and demonstration | Makes the complete product independently installable and evaluable. | Complete |

## Submission MVP line

**Everything through WP-10 is the submission MVP.** The line sits here because installation, demonstration, security review and acceptance evidence are part of a usable submission, not optional polish.

Items below the line are optional and must remain independently removable:

| Priority | Candidate | Rationale | Status |
| --- | --- | --- | --- |
| Later | Markdown or CSV export | Useful after the source backlog workflow is stable. | Not implemented |
| Later | Criterion-to-mockup hover highlighting | Improves review speed but is not required for traceability or correctness. | Not implemented |
| Later | Shareable read-only link | Requires a hosting and access-control model outside the local MVP. | Not implemented |
| Later | Separate story maps per role | Adds planning depth after the single primary-role happy path is proven. | Not implemented |
| Later | Speech input | Alternative input should not complicate the validated text workflow. | Not implemented |
