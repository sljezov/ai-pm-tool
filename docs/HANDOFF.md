# handoff

## completed work package

WP-09 — recovery, continuity and product hardening. WP-00 through WP-08 remain passing.

## implementation convention for every agent

- Make coherent intermediate commits rather than one large work-package commit.
- Keep all Git commit subjects and bodies lowercase.
- Commit schema changes and corresponding migrations together.
- Record validation honestly; a commit alone does not mean the exit gate passed.
- Keep README.md in English and focused on the whole project. Agent handoffs, progress and validation records belong here. See AGENTS.md.

## implemented

- The recommended next stage is derived from persisted roles, active stories, selected story, criteria, mockups and still-effective applied proposals. Opening a project reconciles the stored recommendation instead of trusting stale mutation-specific values.
- Reopened projects show a context-aware `Jätka siit` card. It links to the recommended stage while preserving free non-linear stage navigation.
- Backlog mutations and proposal confirmations accept project-scoped idempotency keys. The key is claimed and completed in the same transaction as the domain mutation, so a repeated request does not duplicate stories, criteria, mockups or proposal effects.
- Browser mutation paths generate idempotency keys and use synchronous ref guards in addition to disabled/loading states. Concurrent key collisions return a safe conflict.
- AI submissions persist request execution state and their user-message link before provider work. Completed requests deduplicate; failed or lease-expired requests reuse the saved message on retry.
- Conversation reads recover both keyed and legacy orphaned `processing` messages after a 60-second lease. Recovery exposes the existing retry control rather than leaving a permanent spinner.
- Provider calls have a bounded timeout in addition to the live adapter's abort timeout. Malformed structured output is still repaired once and then fails safely.
- Workspace tabs support left/right keyboard movement, correct tab focus state, associated tab panels and responsive single-panel behavior. Backlog, project creation and conversation expose busy/status states; route loading and error boundaries now explain recovery clearly.
- The full fixture-AI browser suite covers restart persistence, mobile layouts, manual flows, proposal flows, prototype/refinement, grooming, unavailable AI, repeated mutation keys and a correct grooming resume recommendation.
- README includes a live-provider smoke-test procedure. The deterministic suite remains fixture-based.

## important files

- `src/domain/stages/recommendation.ts` — deterministic recommendation rules.
- `src/services/projects/recommendation.ts` — persisted-state query and recommendation reconciliation.
- `src/services/requests/idempotency.ts` — request-key validation and transactional claim/completion.
- `src/services/ai-orchestration/service.ts` — external-request lifecycle, lease recovery and retry continuity.
- `src/services/stories/service.ts`, `src/services/proposals/workflow.ts` — idempotency inside existing project-scoped transactions.
- `src/components/layout/workspace.tsx` — resume card and accessible responsive tabs.
- `tests/stages.test.ts`, `tests/backlog.test.ts`, `tests/ai.test.ts`, `tests/e2e/projects.spec.ts` — recommendation, deduplication, recovery and acceptance coverage.

## database changes

- Migration `20260930180500_request_idempotency` adds `RequestExecution`.
- A request execution stores a project-scoped unique key, scope, lifecycle status, optional linked resource, timestamps and completion time.
- Deleting a project cascades its request-execution records. The index on project/status/update time supports interrupted-request recovery.

## commands run

- Baseline `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` passed with the WP-08 state: 46 tests across 5 files.
- Final `npm run lint` — passed with no errors or warnings.
- Final `npm run typecheck` — passed.
- Final `npm test` — passed: 55 tests across 6 files.
- Final `npm run build` — passed.
- Final approved `npm run test:e2e` — passed all 10 Chromium scenarios.
- The first sandboxed e2e attempt could not bind port 3100 (`EPERM`); the required approved rerun passed.
- Final `git diff --check` — passed.
- Live-provider smoke test not run: no live model or credentials were configured. README now contains the exact optional procedure.

## known issues

- Large conversation histories still render in full; provider context remains bounded to 12 recent relevant turns.
- Idempotency receipts are retained for the life of the project. This is intentionally simple for the local MVP; a long-running production service would add retention cleanup.
- The 60-second interrupted-request lease assumes provider work completes within its 30-second orchestration timeout. The OpenAI adapter aborts its HTTP request after 25 seconds.
- Fixture review detects exact normalized duplicate wording rather than semantic similarity.
- Repair editing uses validated structured JSON for full story/criterion/mockup changes; split and merge have dedicated field controls.
- Existing npm audit findings remain: four high-severity development-only Prisma CLI entries. No dependencies changed.

## decisions or spec deviations

- No contract-level deviations.
- Recommendation is based on durable artifacts, not conversation replay. An applied refinement counts only while the selected story version remains newer than the proposal base version, so undo removes its effect from the recommendation.
- Requests without an idempotency header remain supported for compatibility and direct service tests; all first-party browser mutation paths send a key.
- A duplicate request that already completed returns current persisted state. A same-key request still processing or reused for another scope returns a safe conflict.

## next package starting point

- Agent 10 starts WP-10: documentation and demonstration package.
- Complete evaluator setup/troubleshooting, one-page usage scenario, development backlog with MVP line, feature-status matrix, known AI limitations, demo script, security review and final acceptance matrix.
- Preserve state-derived recommendations, request idempotency, lease recovery, project-scoped transactions, immutable proposal sources and append-only mockup restoration.
- Run the full clean-checkout validation suite, including migration deployment and all Chromium scenarios.
