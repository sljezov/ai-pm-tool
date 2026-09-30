# Feature status

Status reflects the repository at the WP-10 acceptance point.

## Working

- persistent project creation, listing, stage navigation and state-derived resume recommendation;
- manual story, criterion and open-question editing, archiving, ordering and MVP boundary;
- deterministic Definition of Ready checks with all failures returned together;
- structured mockup editing, safe rendering, append-only history and restoration as a new version;
- one-level atomic undo for the latest backlog mutation;
- guided fixture or live-AI conversation with choices, multiple selection, Other, Skip and retry;
- editable role proposals, a primary role and selective happy-path story confirmation;
- priority recommendation with explicit acceptance or manual override;
- per-criterion prototype review, edit/reject controls and atomic story/mockup application;
- scoped client refinements with before/after previews, stale detection and sibling isolation;
- manual split/merge and independent grooming findings with preview, edit, ignore, apply and undo;
- persistence across reload and server restart, idempotent confirmations and interrupted-request recovery;
- responsive keyboard-accessible workspace tabs, loading, empty and error states;
- deterministic service and Chromium acceptance suites.

## Partial or intentionally limited

- live OpenAI integration supports structured outputs and safe recovery, but is optional, account/model dependent and not part of deterministic CI;
- accessibility includes semantic controls, status/error announcements, keyboard tabs and responsive layouts, but has not received an external WCAG audit;
- the app is a single local workspace; project scoping is enforced, but authentication and user authorization are absent by design;
- undo covers one latest domain mutation, not an arbitrary history stack;
- fixture duplicate detection is normalized exact matching rather than semantic similarity;
- responsive behavior is covered at desktop and a 390 × 844 mobile viewport, not every browser/device combination;
- SQLite is suitable for local evaluation, not concurrent multi-instance deployment.

## Not implemented

- authentication, multi-user authorization and real-time collaboration;
- public hosting, shareable read-only links, billing or subscriptions;
- Jira, GitHub or other external tracker synchronization;
- Markdown/CSV export;
- separate story maps per role;
- speech input;
- arbitrary HTML/JavaScript mockups or high-fidelity design generation;
- semantic concurrent version merging and unlimited undo history.
