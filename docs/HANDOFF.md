# handoff

## completed work package

WP-10 — documentation and demonstration package. WP-00 through WP-10 are accepted.

## implementation convention for every agent

- Make coherent intermediate commits rather than one large work-package commit.
- Keep all Git commit subjects and bodies lowercase.
- Commit schema changes and corresponding migrations together.
- Record validation honestly; a commit alone does not mean the exit gate passed.
- Keep README.md in English and focused on the whole project. Agent handoffs, progress and validation records belong here. See AGENTS.md.

## implemented

- README now provides evaluator requirements, setup, environment-variable explanations, validation, production start, troubleshooting and links to every evaluation artifact.
- The one-page usage scenario follows a product manager from a vague sports-club idea through reviewed stories, a prototype, a VAT refinement, grooming, readiness and persisted resume.
- The development backlog records WP-00 through WP-10 in dependency order, explains that order, places the submission MVP line after WP-10 and separates optional WP-11 candidates.
- Feature status distinguishes working, intentionally partial and not implemented scope. Known AI limitations cover fixture behavior, live variability, context, validation, timeouts, isolation, privacy and low-fidelity mockups.
- The 5–10 minute fixture-AI demonstration script covers every mandatory evaluation action and includes preparation, timing and visible proof points.
- The final security review records verified controls, dependency advisories, residual risks and operating constraints. The final acceptance matrix maps requirements to implementation and automated evidence.
- Fresh SQLite setup is reliable: the migration script creates only the configured empty SQLite file before Prisma applies migrations, Prisma CLI and runtime resolve the default relative path to the same repository-root location, and the seed avoids `tsx` CLI IPC.

## important files

- `README.md` — complete setup, configuration, troubleshooting, architecture and evaluation entry point.
- `docs/USAGE_SCENARIO.md` — one-page evaluator walkthrough.
- `docs/DEMO_SCRIPT.md` — timed repeatable demonstration.
- `docs/DEVELOPMENT_BACKLOG.md` — ordered backlog, rationale and MVP line.
- `docs/FEATURE_STATUS.md` — working, partial and excluded capability matrix.
- `docs/AI_LIMITATIONS.md` — model, provider, fixture and privacy limitations.
- `docs/SECURITY_REVIEW.md` — final security findings and residual risk.
- `docs/ACCEPTANCE_MATRIX.md` — mandatory-flow traceability and clean-checkout commands.
- `scripts/ensure-sqlite-file.mjs`, `prisma.config.ts`, `package.json` — portable clean SQLite migration and seed path.

## database changes

- No schema or migration changed.
- `npm run db:migrate` now ensures the configured local SQLite file and parent directory exist before `prisma migrate deploy`. It does nothing for non-`file:` URLs.
- Relative SQLite configuration is normalized against the repository working directory for Prisma CLI, matching the application adapter and seed behavior.

## commands run

- Baseline `npm run lint` and `npm run typecheck` — passed.
- Baseline `npm test` — passed: 55 tests across 6 files.
- `npm audit --omit=dev` — completed; reports four high-severity advisories in the Prisma CLI dependency graph. The only automatic fix is a breaking Prisma 6 downgrade, so it was not applied.
- Tracked-file credential-pattern scan — passed with no matches.
- Fresh-checkout `npm ci` — passed: 552 packages installed; the audit summary repeated the four advisories.
- Fresh-checkout `cp .env.example .env`, `npm run db:migrate`, `npm run db:seed` — passed; all three migrations applied and the repeatable sample project was created.
- Fresh-checkout `npm run lint` — passed with no errors or warnings.
- Fresh-checkout `npm run typecheck` — passed.
- Fresh-checkout `npm test` — passed: 55 tests across 6 files.
- Fresh-checkout `npm run build` — passed.
- Fresh-checkout sandboxed `npm run test:e2e` — could not bind port 3100 (`EPERM`).
- Fresh-checkout approved `npm run test:e2e` — passed all 10 Chromium scenarios.
- Final `git diff --check` — passed.

## known issues

- Four high-severity `npm audit` findings remain through the Prisma CLI graph (`deepmerge-ts` and `mysql2`). The application uses SQLite and not the affected MySQL paths. Upgrade when Prisma publishes a compatible fix; do not apply the suggested breaking downgrade blindly.
- There is no authentication, authorization or rate limiter. This is a trusted local single-user application and must not be exposed as a public shared service.
- Local SQLite and `.env` data are not encrypted at rest; host filesystem controls are responsible for protection.
- Live AI sends task context to OpenAI, remains model/account dependent and is not part of deterministic acceptance. Fixture AI is scripted and exact-duplicate grooming is not semantic.
- Large conversation histories render in full; provider context remains bounded to recent relevant turns.
- Idempotency receipts remain for the life of a project. A long-running production service would need retention cleanup.
- No external penetration test or formal WCAG audit was performed.

## decisions or spec deviations

- No product-contract deviation.
- Evaluator and completion records remain in dedicated docs; README stays project-level and English as required by AGENTS.md.
- The setup hardening pre-creates an empty SQLite file because Prisma 7's schema engine returned a generic error while creating a new file in the validation environment. Prisma remains solely responsible for applying the schema and migrations.
- Live-provider smoke testing was not run because no live model or credential was configured. The documented fixture flow and unavailable-provider recovery are fully automated; README contains the optional live procedure.

## next package starting point

- The mandatory submission scope is complete. Begin WP-11 only if an optional extension is explicitly selected.
- Preserve explicit human confirmation, story-scoped mutation, atomic transactions, idempotency, append-only mockup history, deterministic fixture acceptance and the documented local-only security boundary.
- Re-run the complete acceptance matrix after any optional feature and keep that feature independently removable.

## interactive wireframe editor — 2026-10-12

- Extended the existing uncommitted mockup builder with a visual canvas, palette drops, pointer-based movement and resizing with an 8 px grid, numeric geometry controls, a larger workspace, device widths, preview, and undo/redo.
- Optional bounded canvas and element geometry remain compatible with old documents and persist through the existing append-only version API. Nested composition remains available through the outline; canvas movement operates on top-level elements.
- Validation: production build, TypeScript checking, ESLint, 60 unit tests, and both targeted Chromium mockup scenarios passed. Browser tests cover actual palette dragging, pointer movement/resizing, undo/redo, width changes, saved geometry, reload, history restoration, and mobile overflow.
- Palette dragging uses native HTML drag/drop. Touch users can add elements with palette taps and then move/resize them with pointer handles or numeric controls.

## AI-first editable wireframes — 2026-10-12

- Prototype proposals now open an AI-created drawing directly in conversation using the same editor as the story's saved mockup. Criteria are a collapsed checklist; technical element-ID selects have been replaced with optional links using visible element names.
- AI instructions request domain-specific, positioned wireframes. Shared layout preparation gives legacy component trees editable geometry while preserving IDs and hierarchy. Prototype and refinement outputs include canvas geometry, including fallback placement for elements missing coordinates.
- All nested drawing elements can be selected and dragged directly, with resize handles and property editing. The larger workspace places properties beside the canvas; layers are collapsed by default.
- Prototype confirmation accepts the edited mockup, validates criteria against that drawing, and saves it atomically. Confirmed drawing/criteria metadata is stored alongside the original AI response so conversation previews survive reload without rewriting proposal history.
- Validation: production build, type checking, lint, 62 unit tests, and all 12 Chromium scenarios passed. The new scenario verifies editable AI geometry, nested element editing/direct dragging, no story mutation before confirmation, and persistence in both conversation and backlog. Reviewed screenshots of the larger editor. Live model generation was not exercised; deterministic fixture generation and provider-boundary tests cover the integration.

## wireframe visibility correction — 2026-10-12

- Unselected elements now retain an opaque white surface and a visible neutral border; selection adds a green frame. Empty elements have a readable type placeholder.
- Fixed list rendering, which previously omitted its label and descriptive text. Canvas containers with children suppress empty placeholders so these cannot overlap nested content.
- Validation: production build and lint passed, 63 unit tests passed, and three targeted Chromium wireframe/mockup scenarios passed. The AI editor scenario explicitly deselects an element and verifies that its text, white surface and border remain visible.

## keyboard deletion and button appearance — 2026-10-12

- Backspace and Delete remove the selected drawing element within the active editor, with undo support. Inputs, textareas, selects, contenteditable regions, composition and modified key combinations are excluded; busy and preview modes cannot delete. Canvas and outline selection move keyboard focus into the editor.
- Unselected buttons now omit the surrounding canvas box, keeping their actual button surface visible; selection still draws the green frame. Other elements retain their neutral frame.
- Validation: production build and lint passed; two targeted Chromium scenarios passed, covering text Backspace protection, selected-element deletion/restoration, and transparent unselected button boxes with visible button content.

## live development compatibility and button bounds — 2026-10-12

- Button wrapper transparency also matches the rendered button child, supporting already-mounted canvas elements without the newer type class. Removed inner button padding and made the actual button fill its drawing bounds; saved previews use the same sizing.
- Clicking preserves authored coordinates instead of snapping to the grid without a drag. Added regression coverage for selection/deletion on positions between grid lines.
- Added only the loopback hostname `127.0.0.1` to Next's allowed development origins. An isolated browser reproduced a non-hydrated development page at that hostname before the change; both localhost and the IP address then supported selection and Backspace on the actual calendar proposal. No project mutations were saved during live diagnostics.
- Validation: build, lint and two targeted Chromium scenarios passed, including legacy wrapper CSS compatibility, zero button padding, text editing protection and keyboard deletion/undo.

## detailed wireframe components and content fitting — 2026-10-12

- Added a calendar element, semantic tables with editable headers/rows, calendar days and time slots, dropdown/date/email/number/text-area fields, list rows, navigation, card/form placeholders, notice icons and image placeholders. Widget data remains bounded structured text; no executable markup or external assets are accepted.
- Legacy table elements whose ID/label identifies a calendar use the calendar presentation without changing their IDs. Named Estonian calendar months derive their length and weekday offset, with an optional explicit override.
- Shared layout fitting applies to the editor, AI generation and saved canvas previews. Undersized fields/widgets expand to their content minimum; side-by-side rows remain aligned and subsequent rows move down while preserving gaps. Updates to widget content fit immediately, including previously mounted editors. Clicking to add an element places it below existing elements.
- AI instructions now request typed widgets with domain-specific sample data and adequate dimensions. Properties expose editable dropdown options, table data, list items, calendar month/day/slots and input kinds.
- Validation: build/type checking and lint passed; 67 unit tests and all 13 Chromium scenarios passed. The new scenario uses the reported 48 px fields and legacy calendar table, measures dropdown/slot containment, edits calendar/table data, saves and reloads. Reviewed the detailed editor screenshot. Live model output was not exercised.

## dedicated grooming workspace — 2026-10-15

- Added a persistent Groomimine tab and stage navigation into a dedicated findings list/detail workspace, explicit review button, category totals, status labels and empty/unavailable states.
- Replaced repair JSON with wording/criteria fields, selectable mockup mappings and the existing visual wireframe editor. Split results have criterion assignment controls and additional result cards; merges show sources and repeated criteria side by side.
- Applying/ignoring advances to the next active finding. Version comparisons disable stale sibling findings after backlog changes; undo is directly available and synchronizes all workspace views. Manual split/merge remains available in both backlog and grooming views.
- Added an optional NEXT_BUILD_DIR configuration for isolated builds/demo servers; .next-grooming is excluded from Git and lint.
- Validation: 67 unit tests, type check, lint and production build passed. New Chromium coverage exercises repair editing, stale siblings, next finding, merge comparison, undo and mobile overflow.
