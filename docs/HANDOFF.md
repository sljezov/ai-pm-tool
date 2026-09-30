# handoff

## completed work package

WP-08 — manual and AI grooming. WP-00 through WP-07 remain passing.

## implementation convention for every agent

- Make coherent intermediate commits rather than one large work-package commit.
- Keep all Git commit subjects and bodies lowercase.
- Commit schema changes and corresponding migrations together.
- Record validation honestly; a commit alone does not mean the exit gate passed.
- Keep README.md in English and focused on the whole project. Agent handoffs, progress and validation records belong here. See AGENTS.md.

## implemented

- Manual split starts from the selected active story; manual merge accepts two to eight active stories. Both show editable result wording and exact criterion assignment before confirmation.
- Split requires every source criterion exactly once across result stories. Merge requires every source criterion, deduplicates normalized identical text, unions its valid mockup references and archives every source.
- Replacement stories are inserted contiguously at the earliest source position. Unrelated stories keep their relative order. Selection moves to the first result when needed. An MVP boundary anchored to a replaced source clears; other boundaries stay attached to their story.
- Source stories and their children remain archived for audit. Current mockups are copied on split. Merge combines current safe mockup trees, namespaces element IDs and rewrites criterion mappings. Open questions are retained on results.
- Split, merge and repair run in one project-scoped transaction, create one complete backlog ChangeEvent and increment/archive the sources. One undo restores all source stories, criteria, questions, mockups, ordering, selection and MVP boundary while archiving generated results.
- AI `review_backlog` uses a strict task schema and the existing validate/repair boundary. Fixture review deterministically finds oversized, exact duplicate, invalid-criterion, missing-mockup and malformed-Connextra cases from current database state.
- Each AI finding is its own pending Proposal with a frozen source snapshot. Apply, edit and ignore operate independently. Editable fields cannot change source IDs, versions or operation type. Stale, cross-project, duplicate-source, lost-criterion, repeated-criterion, invalid-reference and mockup-removal attempts fail atomically.
- Review generation and previews do not mutate backlog data. Applying one finding does not apply or reject siblings. Repeated confirmation is idempotent. Overlapping sibling findings remain pending and will report stale state if their sources changed.
- The review UI shows before/after wording, criteria, mockups, archive/order/MVP behavior and controls per finding. Repair findings expose validated structured editing; split/merge expose result wording and split criterion reassignment.
- The conversation has an explicit `Vaata backlog üle` action. The backlog panel has manual split and merge controls. Both flows work without changing the existing story editor or refinement flows.
- README usage now documents grooming behavior and stale/undo rules.

## important files

- `src/domain/grooming/contracts.ts` — strict operations, findings and response limits.
- `src/domain/grooming/review.ts` — deterministic fixture findings based on current backlog state.
- `src/services/grooming/service.ts` — validation, criterion/mockup transformation, archive/order/MVP behavior and atomic application.
- `src/components/backlog/grooming.tsx` — manual split and merge selection, editing and confirmation.
- `src/components/proposals/grooming.tsx` — per-finding preview and apply/edit/ignore controls.
- `src/services/ai-orchestration/service.ts` — review context and independent proposal persistence.
- `src/services/proposals/workflow.ts` — scoped finding claims and application.
- `tests/grooming.test.ts`, `tests/e2e/projects.spec.ts` — service invariants and browser vertical slice.

## database changes

- None. Existing Story, AcceptanceCriterion, OpenQuestion, MockupVersion, Proposal and ChangeEvent models support this package.
- `type: "grooming"` stores one validated finding per Proposal. `beforeSnapshotJson` freezes the active-story review input; `afterSnapshotJson` stores the finding and operation.
- Replaced source stories use `archivedAt`; generated results are new records. Undo archives generated records and restores source records from the complete backlog snapshot.

## commands run

- Baseline from WP-07: lint, typecheck, 40 service tests and build passed; 9 browser scenarios passed.
- Final `npm run lint` — passed with no errors or warnings.
- Final `npm run typecheck` — passed.
- Final `npm test` — passed: 46 tests across 5 files.
- Final `npm run build` — passed.
- Approved `npm run test:e2e` — passed all 10 Chromium scenarios.
- Inspected the generated grooming mobile screenshot; previews and controls fit the viewport, and the automated overflow assertion passes.
- `git diff --check` — passed.
- Live-provider smoke test not run: no live model/credentials configured. Fixture review runs through the same schema, semantic validation, proposal and confirmation boundaries.

## known issues

- Fixture review detects exact normalized duplicate wording; it does not attempt semantic similarity.
- Fixture missing-mockup repair uses the existing booking fixture as an editable example, so a user should tailor it to the story before applying.
- Applying a finding can make another finding over the same source stale. The stale finding stays pending so the user can see why it no longer applies and regenerate the review.
- Repair editing currently uses validated structured JSON because it can contain full story, criterion and mockup changes. Split and merge have field controls.
- Merged mockups are combined into one safe document rather than selecting one source screen.
- A server process terminated while a request is marked processing can leave that turn without retry. WP-09 should add interrupted-request recovery/lease expiry and generalized request idempotency.
- Large conversation histories render in full; provider context remains bounded to 12 recent relevant turns.
- Existing npm audit findings remain: four high-severity development-only Prisma CLI entries. No dependencies changed.

## decisions or spec deviations

- No contract-level deviations.
- The MVP boundary clears if any replaced source is its anchor, matching the existing archive rule and specification. The UI explains this before confirmation.
- Split copies the current source mockup to each result, preserving criterion mappings. Merge namespaces colliding element IDs and rewrites mappings.
- Open questions are copied to each split/merge result so unresolved product decisions are not silently lost.
- AI findings are capped at 12 per review to keep strict structured responses and stored snapshots bounded.

## next package starting point

- Agent 9 starts WP-09: recovery, continuity and product hardening.
- Add recommended-next-step calculation from actual persisted state, reopen/resume UI, interrupted-request recovery and generalized double-submit protection.
- Review responsive workspace and accessibility states with the now complete manual, proposal, prototype, refinement and grooming flows.
- Preserve the existing project-scoped transactions, immutable proposal sources, complete ChangeEvent snapshots and append-only mockup restoration.
- Keep isolated test databases, build before browser tests, lowercase intermediate commits and honest validation records.
