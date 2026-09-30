# handoff

## completed work package

WP-03 — safe mockups and versioning. WP-00 through WP-02 remain passing.

## implementation convention for every agent

- Make coherent intermediate commits rather than one large work-package commit.
- Keep all Git commit subjects and bodies lowercase.
- Commit schema changes and corresponding migrations together.
- Record validation honestly; a commit alone does not mean the exit gate passed.
- Keep README.md in English and focused on the whole project. Agent handoffs, progress and validation records belong here, not in README.md. See AGENTS.md.

## implemented

- Strict validated MockupDocument and recursive component schema: unique IDs, six element levels, 200 elements, bounded text/actions and a pre-recursion resource guard.
- Allowlisted primitive props only; unknown fields/types, scripts, event handlers, raw HTML, CSS, URLs and embeds are rejected. Actions are inert identifiers.
- Application-owned React wireframe renderer with literal text, disabled illustrative controls and visible element IDs.
- Manual fixture selection, JSON editing, preview, current version/history view and restore-as-new-version.
- Project-scoped transactional save and restore commands through the existing backlog endpoint. Story versions advance and one logical change event records each operation.
- Criterion references show current element IDs; mockup mutations recalculate persisted validation and fresh readiness, downgrading invalid ready stories.
- Append-only mockup undo restores the previous structure by appending a new version while preserving every historical record.
- Security/rendering tests, isolated-database history/scope/readiness/undo tests, and a browser scenario for manual creation, edit, restore, reload and mobile.

## important files

- `src/domain/mockup/document.ts` — document schema, safe parsing and representative fixtures.
- `src/components/mockup/renderer.tsx` — application-owned safe preview components.
- `src/components/mockup/editor.tsx` — manual editor, preview and history controls.
- `src/services/mockups/service.ts` — transactional append and criterion revalidation helper.
- `src/services/stories/service.ts` — scoped save/restore commands and mutation conventions.
- `src/services/undo/service.ts` — complete snapshot restore with append-only mockup reversal.
- `src/domain/criteria/validation.ts`, `src/domain/readiness/readiness.ts` — validated current-document references and fresh readiness.
- `tests/mockup.test.ts`, `tests/backlog.test.ts`, `tests/e2e/projects.spec.ts` — security, service and browser invariants.

## database changes

- None; existing MockupVersion and ChangeEvent models support WP-03.
- Undo of the first mockup appends a validated empty document named Mockup eemaldatud. Empty current documents represent absence and do not satisfy readiness; historical versions remain available.
- Undo of later saves/restores appends the saved structure, including when only the version name changed. History is never deleted or overwritten.

## commands run

- Before changes: lint, typecheck, 12 tests, build and 3 browser tests passed. Browser tests initially hit sandbox EPERM and passed with permission to run the local server.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed, 16 tests across 3 files.
- `npm run build` — passed before browser validation.
- `npm run test:e2e` — passed, 4 Chromium scenarios. New scenario covers fixture creation/edit, inert renderer controls, version history/restore, reload, mobile and rejected executable API input with unchanged state.
- Initial new browser assertion matched both current and hidden draft previews; scoped first-preview assertion fixed the test and the suite passed.
- Desktop and 390px mobile mockup screenshots visually reviewed; automated overflow check passed.
- Git writes and browser server execution used sandbox approvals.

## intermediate commits

- `da3c628` — validated mockups, transactional append/restore, undo and security tests.
- UI/history/browser coverage and this handoff are in the subsequent lowercase commit (see git history).

## known issues

- Existing npm audit findings remain: four high-severity development-only Prisma CLI entries (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`); no dependency changes were made in WP-03. See previous package history for details.
- Manual mockup editing uses structured JSON plus fixtures rather than a visual drag-and-drop editor. The preview is intentionally illustrative; it does not execute navigation or actions.
- Table, form, navigation and layout components render low-fidelity application-owned groups; arbitrary URLs, CSS and external assets are excluded.
- AI, conversation and split/merge remain later packages. `recommendedNextStage` still defaults to idea until WP-09.
- Undo restores saved story version numbers exactly under the existing convention. Future proposal work must ensure stale proposals remain rejected after undo.

## decisions or spec deviations

- No contract changes. Empty-document append represents clearing the current mockup during undo without overwriting history.
- Allowed MVP props are required, disabled, placeholder and columns. Other props are rejected; action identifiers are displayed with disabled controls and never executed.

## next package starting point

- Agent 4 starts WP-04: server-only provider boundary, fixture provider, structured response validation/repair, guided clarification and roles, conversation persistence and failure/retry states.
- Read IMPLEMENTATION_SPEC.md and start from the passing baseline. Keep AI responses as proposals rather than direct mutations.
- Reuse MockupDocument validation for later prototype/refinement payloads. appendMockup must be called only inside a transaction after resolving a project-scoped story; its helper does not perform scope lookup itself.
- Continue build before browser tests, isolated test databases, coherent lowercase commits and honest handoff records.
