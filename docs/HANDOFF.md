# handoff

## completed work package

WP-06 — criteria and prototype proposal. WP-00 through WP-05 remain passing.

## implementation convention for every agent

- Make coherent intermediate commits rather than one large work-package commit.
- Keep all Git commit subjects and bodies lowercase.
- Commit schema changes and corresponding migrations together.
- Record validation honestly; a commit alone does not mean the exit gate passed.
- Keep README.md in English and focused on the whole project. Agent handoffs, progress and validation records belong here. See AGENTS.md.

## implemented

- Prototype AI task, strict envelope/payload schemas, unique criterion identifiers and bounded safe MockupDocument validation. Unknown element references, duplicate mappings, executable tree properties and foreign target/version output are rejected through the existing one-repair pipeline.
- Fresh selected-story context includes version, wording, criteria/mappings, unresolved questions and current mockup. Proposal rows carry targetStoryId, baseStoryVersion and a before snapshot; regeneration supersedes pending prototypes only for the same target.
- Per-criterion accept, edit and reject controls, deterministic validation feedback and editable mockup element mappings. Optional story wording has an explicit opt-in preview. Safe application-owned renderer previews the proposed wireframe.
- Generate from a confirmed priority recommendation or from the selected manual backlog story. Missing selection returns a direct instruction; free text after a prototype proposal regenerates that task using current database context.
- Explicit atomic confirmation validates the stored target/version and submitted criterion identifiers, text and mappings. It replaces only target-story criteria, appends one AI mockup version, optionally updates wording and increments the story version once.
- Idempotent repeated confirmation, project scoping and stale-version rejection. Invalid edits leave the pending proposal and all domain data unchanged. Discard marks only the proposal rejected.
- One complete backlog ChangeEvent per applied prototype. Readiness is freshly recalculated; an invalidated ready story becomes needs_clarification. The recommended next stage advances to refinements while the current prototype stage remains available.
- Existing one-level undo restores wording, criteria, selected story and stages together; mockup restoration appends a new version so history remains intact.
- Service tests cover fresh context, no mutation before confirmation, selective/edit application, sibling equality, stale/scope/mapping rejection, optional wording, readiness downgrade, history, idempotency and undo.
- Browser flow now continues through priority → prototype preview → accept/edit/reject → apply → reload. A separate browser scenario covers stale conflicts and discard; mobile prototype layout is checked and captured.
- README usage now documents prototype review and confirmation.

## important files

- `src/domain/ai/contracts.ts` — prototype response schema and explicit confirm/discard commands.
- `src/lib/ai/provider.ts` — prototype fixture, live instructions and target/version checks.
- `src/services/ai-orchestration/service.ts` — selected-story context, persisted scoped proposals and missing-selection handling.
- `src/services/proposals/workflow.ts` — atomic target/version checks, criterion replacement, append-only mockup, readiness and ChangeEvent.
- `src/services/mockups/service.ts` — source-aware appendMockup; existing callers default to manual.
- `src/components/proposals/prototype.tsx` — criterion decisions, editing/mappings, warnings, optional wording and safe preview.
- `src/components/conversation/conversation.tsx` — prototype generation and proposal rendering.
- `tests/ai.test.ts`, `tests/e2e/projects.spec.ts` — service invariants and browser vertical slice.

## database changes

- None. Existing Story, AcceptanceCriterion, MockupVersion, Proposal and ChangeEvent models support this package.
- Prototype proposals use `type: "prototype"` and persist validated PrototypeProposalPayload in afterSnapshotJson, with targetStoryId/baseStoryVersion separately persisted for the confirmation allowlist.
- appendMockup accepts an optional source parameter; prototype confirmation uses `ai`.
- Confirmed prototype criteria replace the target's current criterion set. Previous criteria remain in complete audit/undo snapshots.
- Undo keeps mockup history append-only; when the previous story had no mockup, an empty document becomes the new current version.

## commands run

- Baseline `npm run lint`, `npm run typecheck`, `npm test` (32 tests) and `npm run build` — passed before implementation.
- Final `npm run lint` — passed.
- Final `npm run typecheck` — passed.
- Final `npm test` — passed: 36 tests across 4 files.
- Final `npm run build` — passed.
- Sandbox `npm run test:e2e` — server could not bind 127.0.0.1:3100 (EPERM); no browser assertions ran.
- Approved `npm run test:e2e` — passed all 8 Chromium scenarios. A subsequent run including the mobile prototype assertion also passed all 8.
- Inspected the generated prototype mobile screenshot; controls and safe preview fit the viewport.
- Actual live-provider smoke test was not run because no live credentials/model are configured. Existing mocked transport tests pass; prototype generation, JSON schema conversion and scope validation run through the real adapter boundary with fixture/test providers.

## intermediate commits

- `74afe0d` — add validated prototype proposals and atomic story confirmation.
- The subsequent lowercase commit contains prototype review controls, browser coverage, additional readiness/history coverage and documentation (see git history).

## known issues

- Fixture AI is scripted demonstration content. Its prototype uses a representative sports-club booking wireframe even if another story is selected; live AI receives the actual selected story and current database context.
- Undoing a confirmed proposal restores domain state but does not reopen the already-applied Proposal row; generate a fresh proposal to apply again.
- Refinement and grooming AI tasks remain for WP-07 and WP-08; WP-07 was not started.
- A server process terminated while a request is marked processing can leave that turn without a retry action. WP-09 should add interrupted-request recovery/lease expiry and generalized request idempotency.
- Large conversation histories still render in full; AI context remains bounded to the latest 12 relevant turns.
- Existing npm audit findings remain: four high-severity development-only Prisma CLI entries (prisma, @prisma/config, deepmerge-ts, mysql2). No dependencies changed.

## decisions or spec deviations

- No contract-level deviations.
- Prototype confirmation replaces the reviewed criterion set rather than appending duplicates; the UI states this before confirmation and undo restores the prior set.
- Warnings may be explicitly confirmed but fail checks block confirmation. Readiness remains authoritative and prevents warning criteria from making a story ready.
- Prototype confirmation keeps currentStage at prototype and recommends refinements so the accepted prototype remains visible.

## next package starting point

- Agent 7 starts WP-07: refinement AI task, explicit changed-area before/after schemas, single-story allowlist and wireframe previews.
- Reuse prototype targetStoryId/baseStoryVersion persistence, validation/repair pipeline and atomic proposal claim.
- Preserve one logical ChangeEvent and append-only mockup versions; apply only changed areas and keep other stories byte-for-byte unchanged.
- Add separate pending proposals for cross-story suggestions; do not broaden the target story transaction.
- Keep isolated test databases, build before browser tests, lowercase intermediate commits and honest validation records.
