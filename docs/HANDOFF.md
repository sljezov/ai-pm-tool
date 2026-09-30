# handoff

## completed work package

WP-05 — story proposals and priority. WP-00 through WP-04 remain passing.

## implementation convention for every agent

- Make coherent intermediate commits rather than one large work-package commit.
- Keep all Git commit subjects and bodies lowercase.
- Commit schema changes and corresponding migrations together.
- Record validation honestly; a commit alone does not mean the exit gate passed.
- Keep README.md in English and focused on the whole project. Agent handoffs, progress and validation records belong here. See AGENTS.md.

## implemented

- Strict role, happy-path story and priority response schemas with bounded text, unique identifiers, contiguous happy-path order, five-to-eight story range and allowlisted next actions.
- Live and deterministic fixture provider support for story generation and priority recommendation. Generated stories must match the current primary role; priority recommendations must reference the active database backlog.
- Editable/selectable role proposal UI with an explicit primary role and transactional confirmation. Confirmation replaces project roles only after server validation.
- Selectable ordered story cards with explicit `Lisa kõik`, `Lisa valitud` and regeneration controls. Only selected stories are appended, positions remain contiguous and repeat confirmation is idempotent.
- Priority recommendation with rationale. Users may accept the suggestion or explicitly choose another current story; ordering and selection change only on confirmation.
- Project stages advance through stories, priorities and prototype after the corresponding confirmed operations.
- Pending proposals are project-scoped, type-checked and atomically claimed before mutation. A newer role choice supersedes stale story/priority proposals; applying stories supersedes stale priority proposals.
- One logical backlog ChangeEvent per confirmed role, story or priority operation. One-level undo now restores roles, stages, story order and selected story as part of the complete snapshot.
- Conversation proposal identifiers/statuses and current database roles/backlog are returned as scoped DTOs. A small client event keeps the independent backlog panel current after confirmation.
- README usage and architecture text now describes the confirmed role/story/priority flow.

## important files

- `src/domain/ai/contracts.ts` — story/priority envelopes and proposal confirmation commands.
- `src/lib/ai/provider.ts` — live instructions, fixture stories/priority and database-context domain checks.
- `src/services/ai-orchestration/service.ts` — fresh role/backlog context and persistent story/priority proposals.
- `src/services/proposals/workflow.ts` — transactional, scoped and idempotent proposal confirmation.
- `src/services/stories/service.ts`, `src/services/undo/service.ts` — complete role/stage/backlog snapshots and one-level undo.
- `src/components/conversation/conversation.tsx` — role editing, story selection and priority decision controls.
- `src/components/backlog/backlog.tsx` — post-confirmation backlog synchronization without losing manual-operation notices.
- `tests/ai.test.ts` — validation, no-mutation, selective apply, idempotency, scope, stale proposal, stage and undo coverage.
- `tests/e2e/projects.spec.ts` — full fixture role → five stories → alternate priority browser flow.

## database changes

- None. Existing ProjectRole, Story, Proposal and ChangeEvent models cover this package.
- Story proposals use `type: "stories"` and persist the validated StoryProposalPayload in `afterSnapshotJson`.
- Priority proposals use `type: "priority"` and persist `{ storyId, rationale }` in `afterSnapshotJson`.
- New backlog snapshots include roles plus current/recommended stages. Undo remains tolerant of older snapshots that do not contain those fields.

## commands run

- Baseline `npm run lint`, `npm run typecheck`, `npm test` (28 tests) and `npm run build` — passed before implementation.
- `npm run lint` — passed after implementation.
- `npm run typecheck` — passed after implementation.
- `npm test` — passed: 32 tests across 4 files.
- `npm run build` — passed with the final handoff state.
- Initial sandbox `npm run test:e2e` could not bind `127.0.0.1:3100` (`EPERM`). The approved run then exposed two regressions: backlog remounting removed a notice, and editable role names were no longer visible as text. Both were corrected.
- Approved `npm run test:e2e` reruns — final run passed all 7 Chromium scenarios, including the new WP-05 flow.
- Actual live-provider smoke test was not run because no live API credentials/model are configured. Mocked provider transport coverage from WP-04 remains passing; new task validation is covered with fixture and service tests.

## intermediate commits

- `bfda56c` — validated story/priority generation and transactional proposal workflow.
- Conversation UI, complete undo snapshots, browser coverage, README and this handoff are in the subsequent lowercase commit (see git history).

## known issues

- Fixture AI is scripted demonstration content and does not semantically interpret arbitrary story/priority instructions. Live AI receives the latest text and current database context.
- Undoing a confirmed proposal restores domain state but does not reopen the already-applied Proposal row; generate a fresh proposal to apply again.
- Prototype, refinement and grooming AI tasks remain for WP-06 through WP-08.
- A server process terminated while a request is marked processing can leave that turn without a retry action. WP-09 should add interrupted-request recovery/lease expiry and generalized request idempotency.
- Large conversation histories still render in full; AI context remains bounded to the latest 12 relevant turns.
- Existing npm audit findings remain: four high-severity development-only Prisma CLI entries (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`). No dependencies changed.

## decisions or spec deviations

- No contract-level deviations. Priority confirmation moves the chosen story to position zero and selects it; choosing a different current story uses the same explicit confirmation path.
- Role confirmation replaces the current role set because WP-05 presents a complete editable proposal. It also supersedes dependent pending proposals so an old primary-role story map cannot be applied.
- Proposal confirmations share the one-level backlog undo mechanism by expanding snapshots to roles and stages, preserving the global complete-snapshot invariant.

## next package starting point

- Agent 6 starts WP-06: prototype AI schema/task, selected-story context, per-criterion accept/edit/reject state, validated wireframe preview and atomic apply.
- Reuse the proposal identifier/status DTO and atomic claim pattern. Prototype proposals must carry targetStoryId and baseStoryVersion and reject stale versions before mutation.
- Apply criteria plus one append-only mockup version in one transaction and one logical ChangeEvent. Re-run readiness after apply and keep another story byte-for-byte unchanged.
- Keep the application-owned safe MockupDocument renderer; never accept HTML, scripts or executable properties.
- Continue with isolated databases, build before browser tests, coherent lowercase commits and honest validation records.
