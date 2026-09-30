# handoff

## completed work package

WP-04 — AI infrastructure and guided clarification. WP-00 through WP-03 remain passing.

## implementation convention for every agent

- Make coherent intermediate commits rather than one large work-package commit.
- Keep all Git commit subjects and bodies lowercase.
- Commit schema changes and corresponding migrations together.
- Record validation honestly; a commit alone does not mean the exit gate passed.
- Keep README.md in English and focused on the whole project. Agent handoffs, progress and validation records belong here. See AGENTS.md.

## implemented

- Server-only AiProvider boundary, OpenAI Responses adapter, deterministic explicitly marked fixture provider and unconfigured-provider mode.
- Live provider uses server-side credentials, configured model, strict JSON-schema output, storage disabled and a 25-second timeout per attempt. No new dependencies.
- Strict bounded clarification/role response envelopes, unique question/option/role identifiers, one to four allowlisted next actions, one repair attempt and complete rejection of invalid output.
- Fresh task-relevant project/role context, bounded recent conversation, explicit proposal-only mutation boundary and free-text clarification/role adjustment path.
- Project-scoped persistent user, assistant and safe failure messages. Accepted role output creates a pending Proposal; regeneration supersedes older pending role proposals atomically. Generating output never changes ProjectRole, Story or ChangeEvent.
- Retry claims a failed persisted user message, reuses it, and safely returns the existing result after completion. Provider errors and diagnostics are not persisted or returned.
- Conversation UI across stages, single/multiple choice buttons, Other text and Skip on every question, next actions, loading/unavailable states and per-message retry.
- Manual backlog remains independent of conversation request state and AI availability.
- README and environment example describe fixture/live setup and current usage; no handoff records were added to README.

## important files

- `src/domain/ai/contracts.ts` — validated response/input contracts and shared conversation DTOs.
- `src/lib/ai/provider.ts` — server-only live/fixture adapters, configuration and validation/repair pipeline.
- `src/services/ai-orchestration/service.ts` — scoped context, conversation persistence, pending role proposals and retries.
- `src/app/api/projects/[projectId]/conversation/route.ts` — bounded validated GET/POST API.
- `src/components/conversation/conversation.tsx` — guided interaction, conversation history and failure recovery.
- `src/components/layout/workspace.tsx`, `src/app/projects/[projectId]/page.tsx` — persisted conversation integration.
- `tests/ai.test.ts` — malformed output, repair bounds, safe errors, mocked live transport, context, scope, proposal-only writes and reconnect/retry tests.
- `tests/e2e/projects.spec.ts` — fixture interactions plus unavailable AI/manual functionality/restart recovery.

## database changes

- None. Existing ConversationMessage and Proposal models cover this package.
- Role proposals use `type: "roles"`, `afterSnapshotJson: { roles: [{ temporaryId, name, rationale }] }` and pending status. Existing pending siblings become superseded when a new valid proposal is saved.
- Assistant structured payload stores task, validated response, proposalId (for role output) and replyTo. User structured payload stores task, request status and answered question IDs. These are continuity metadata, not authoritative backlog state.

## commands run

- Baseline lint, typecheck, 16 tests and production build passed. Initial sandbox browser run failed with local-server EPERM; authorized rerun passed all 4 baseline scenarios.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: 28 tests across 4 files.
- `npm run build` — passed before browser validation.
- `npm run test:e2e` — passed: 6 Chromium scenarios against isolated temporary databases. New coverage includes choices, Other, Skip, multiple selection, literal script-like answer text, roles without backlog mutation, reload, mobile overflow, unavailable AI, retry without duplicated user message, manual backlog, and provider-mode recovery after server restart.
- Desktop and 390px mobile conversation screenshots visually reviewed; controls wrap and automated overflow checks pass.
- New service test initially used the wrong existing mutation method and omitted required status/size; corrected the test to use the existing manual service contract. No product defect was hidden.
- Review added explicit malformed-successful-HTTP-envelope repair coverage; final tests include this correction.
- Actual live provider smoke test was not run: no configured API credentials/model. Mocked transport verifies authorization placement, configured model, strict schema, response extraction and safe HTTP failure behavior.
- Git writes and local browser server use sandbox approval.

## intermediate commits

- `900b0d5` — validated server AI pipeline, conversation service/API and 11 new security/service tests.
- Conversation UI, configuration/docs, browser coverage and this handoff are in the subsequent lowercase commit (see git history).

## known issues

- Fixture AI is scripted demonstration content; it does not perform live semantic interpretation of arbitrary free text. Live AI receives the latest free text and current task context. Fixture mode is visibly labeled.
- Role confirmation, editing/selection and primary-role choice belong to WP-05. The current role cards are proposals and cannot mutate roles.
- Story/prototype/refinement/grooming AI tasks are named in the provider contract but remain unimplemented later packages; routes accept only clarification and role tasks.
- `recommendedNextStage` remains the existing idea default until WP-09's state-derived recommendation work.
- A server process terminated while a request is marked processing can leave that turn without a retry action. WP-09 should add interrupted-request recovery/lease expiry and generalized request idempotency. Normal timeout/network/invalid-output failures are persisted as failed and retryable now.
- Large histories currently render in full; context sent to AI is limited to the latest 12 relevant turns. Pagination/scroll improvements can be part of WP-09.
- Existing npm audit findings remain: four high-severity development-only Prisma CLI entries (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`). No dependencies changed.
- Previous WP-03 limitation remains: manual mockup editing uses structured JSON and fixtures, with low-fidelity inert application-owned controls. Undo restores saved story version numbers under the existing convention; later proposal work must guard stale proposals even after undo.

## decisions or spec deviations

- No contract changes. The role payload shape fills a spec implementation detail and retains role application for WP-05.
- OpenAI model is explicitly configured rather than hardcoded; incomplete live configuration safely shows unavailable AI. Fixture demonstration requires explicit AI_PROVIDER=fixture.
- Raw provider output is excluded from repair context; safe validation paths/codes plus original task context are sent for the one repair attempt, preventing untrusted output or credentials from entering error logs/messages.

## next package starting point

- Agent 5 starts WP-05: role confirmation/editing and primary selection, happy-path story generation, explicit selective confirmation, priority recommendation and stage updates.
- Reuse task schemas/validated provider pipeline and persisted role proposals; extend the task/action allowlist deliberately. Add a scoped confirmation service rather than interpreting conversation as domain state.
- Surface a pending proposal identifier in the conversation DTO when adding apply controls; the stored assistant metadata already contains proposalId. Revalidate pending status and edited roles on the server, and create one logical ChangeEvent per confirmed operation.
- Keep retrying AI requests separate from applying a domain proposal. Completed AI retries currently return existing history without generating duplicates.
- Build current database context for stories/priority; never infer authoritative story state from chat. Preserve transaction, readiness, ordering, undo and append-only mockup conventions.
- Read IMPLEMENTATION_SPEC.md in full and start from this passing baseline. Continue build before browser tests, isolated databases, coherent lowercase commits and honest validation records.
