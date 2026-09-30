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
