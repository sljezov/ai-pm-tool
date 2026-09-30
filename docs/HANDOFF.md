# handoff

## completed work package

WP-07 — client refinements and previews. WP-00 through WP-06 remain passing.

## implementation convention for every agent

- Make coherent intermediate commits rather than one large work-package commit.
- Keep all Git commit subjects and bodies lowercase.
- Commit schema changes and corresponding migrations together.
- Record validation honestly; a commit alone does not mean the exit gate passed.
- Keep README.md in English and focused on the whole project. Agent handoffs, progress and validation records belong here. See AGENTS.md.

## implemented

- Refinement task is available through the validated provider boundary, deterministic fixture, task-specific strict schema and one repair attempt. Context comes from the selected story's current database wording/version, criteria/mappings, unresolved questions and current mockup.
- Free text following prototype confirmation (or in the refinements stage) requests a refinement. The explicit `Täpsusta valitud lugu` control uses the current text and selected story. Existing task buttons and manual backlog features remain usable.
- Changed areas explicitly contain before/after story wording, criterion sets and safe wireframes. Unchanged areas are omitted. Before values, target/version, cross-story suggestion IDs and resulting criterion mappings are verified before display and again inside confirmation.
- Review UI shows each changed area's before/after values and both wireframes through the safe renderer. `Muuda` enables story fields, criterion text/mappings and validated structured mockup editing; `Rakenda täpsustus` and `Loobu` are explicit. Other-story suggestions show the relevant story action separately.
- Strict server allowlist permits only target-story role/action/benefit, criteria and mockup changes. Commands cannot inject IDs, order, status, size, open questions or another story; edits cannot introduce an area absent from the reviewed proposal.
- Atomic confirmation claims the pending proposal, changes only reviewed target areas, increments the target version once and creates exactly one complete backlog ChangeEvent. Repeated confirmation does not duplicate changes. Fresh readiness downgrades an invalidated ready story.
- Applied wireframe changes append source `refinement` versions. Word-only refinements preserve criteria and mockup versions. Undo restores wording, criteria and the current wireframe together by appending a restored version; old history remains intact.
- Cross-story effects are independent `cross_story_suggestion` pending Proposal rows with a source proposal link and suggestion text. Applying/discarding the target refinement never changes sibling stories or applies these rows. They are informational pending suggestions for separate later review, not executable patches; WP-08 grooming is not implemented.
- Stale confirmation leaves domain data and the proposal pending, explains the conflict and instructs regeneration. Regeneration reads fresh state and supersedes only the same target's previous pending refinement. Discard changes proposal status only.
- Service coverage proves byte-for-byte sibling equality, no mutation before confirmation, edited/idempotent atomic apply, one event, append-only history, multi-entity undo, omitted-area preservation, stale/project/field/mapping rejection and one-repair failure without proposal persistence.
- Browser vertical slice continues through VAT refinement before/after → edit → apply → reload → undo. Separate scenario covers stale rejection, discard, fresh regeneration, mobile preview and sibling isolation.
- README usage updated for the working refinement flow.

## important files

- `src/domain/ai/contracts.ts` — strict changed-area schemas and explicit confirm/discard commands.
- `src/domain/ai/refinement.ts` — shared before-state, scope and resulting mapping checks.
- `src/lib/ai/provider.ts` — fixture refinement, live instructions, validation/repair checks and response budget.
- `src/services/ai-orchestration/service.ts` — task selection, fresh scoped context and independent suggestion persistence.
- `src/services/proposals/workflow.ts` — atomic single-story allowlist, readiness, history and ChangeEvent.
- `src/components/proposals/refinement.tsx` — editable before/after preview and safe wireframe comparison.
- `src/components/conversation/conversation.tsx` — explicit refinement action and proposal rendering.
- `tests/ai.test.ts`, `tests/e2e/projects.spec.ts` — service invariants and browser flows.

## database changes

- None. Existing Proposal, Story, AcceptanceCriterion, MockupVersion and ChangeEvent models support this package.
- `type: "refinement"` stores validated RefinementPayload with independently persisted targetStoryId/baseStoryVersion and before snapshot.
- `type: "cross_story_suggestion"` stores only targetStoryId, suggestion text and sourceProposalId. It cannot use the confirmation endpoint to mutate a story; request a fresh scoped refinement for an affected story instead.
- Changed criterion sets replace only target criteria; audit/undo snapshots preserve the prior set. Unchanged sets retain their existing IDs and values.

## commands run

- Baseline `npm run lint`, `npm run typecheck`, `npm test` (36 tests) and `npm run build` — passed before implementation.
- Final `npm run lint` — passed.
- Final `npm run typecheck` — passed.
- Final `npm test` — passed: 40 tests across 4 files.
- Final `npm run build` — passed.
- Sandbox `npm run test:e2e` — server could not bind 127.0.0.1:3100 (EPERM); browser assertions did not run.
- Approved `npm run test:e2e` — passed all 9 Chromium scenarios.
- Inspected generated refinement mobile screenshot; controls and safe wireframe previews fit the viewport. Automated mobile overflow check passes.
- `git diff --check` — passed.
- Live-provider smoke test not run: no live model/credentials configured. Fixture requests run through the real schema conversion, task validation/repair and domain scope boundary; existing mocked live transport coverage passes.

## intermediate commits

- `5e39eba` — add validated single-story refinements and atomic confirmation.
- `add refinement review controls and browser coverage` — review/edit UI, browser coverage, omitted-area coverage and final handoff/usage documentation (see git history for the hash).

## known issues

- Fixture refinement is scripted VAT demonstration content (24%) rather than interpretation of arbitrary client wording. Live AI receives the actual input and fresh selected-story state.
- Cross-story suggestions are persisted and shown separately but are informational; automatically applying cross-story changes is intentionally unsupported. Review a suggested story separately and generate a new scoped refinement.
- Undo restores domain state but does not reopen the already-applied Proposal row. Generate a new proposal to apply again.
- Undo from no prior mockup creates a new empty current document, preserving append-only history (existing WP-06 behavior).
- A server process terminated while a request is marked processing can leave that turn without retry. WP-09 should add interrupted-request recovery/lease expiry and generalized request idempotency.
- Large conversation histories render in full; provider context remains bounded to 12 recent relevant turns.
- Existing npm audit findings remain: four high-severity development-only Prisma CLI entries (prisma, @prisma/config, deepmerge-ts, mysql2). No dependencies changed.

## decisions or spec deviations

- No contract-level deviations.
- Cross-story suggestion rows contain descriptive text, not mutation payloads; this keeps every executable refinement under its own target/version and explicit confirmation.
- A mockup-only refinement revalidates existing target criterion mappings; removing a referenced element requires an accompanying reviewed criterion change.
- Warnings may be explicitly confirmed but fail checks block apply. Readiness remains authoritative.
- Applied refinement keeps currentStage at refinements and recommends grooming; WP-08 remains unimplemented.

## next package starting point

- Agent 8 starts WP-08: manual split/merge and independent validated AI backlog review findings.
- Reuse transactional proposal claim, project scoping, complete ChangeEvent snapshots and append-only mockup restoration.
- Add split/merge previews and independent finding apply/edit/ignore controls; do not reinterpret informational cross_story_suggestion rows as executable patches.
- Preserve contiguous ordering, archive strategy, MVP boundary and multi-entity undo invariants.
- Keep isolated test databases, build before browser tests, lowercase intermediate commits and honest validation records.
