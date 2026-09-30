# handoff

## completed work package

WP-00 — repository bootstrap and quality gates.

WP-01 — persistence and project shell.

Agent 1 exit gate passed: clean lockfile install, empty-database migrations, lint, typecheck, five service tests, production build and two Chromium browser tests. A browser test stops and restarts the production server before reopening the project at its persisted stage.

## implementation convention for every agent

- Make meaningful intermediate commits as coherent pieces are implemented. Do not accumulate an entire work package as one large uncommitted change.
- Keep all Git commit subjects and bodies lowercase.
- Commit database migrations with the corresponding schema changes.
- Record validation honestly; a commit does not imply a work package has passed its exit gate.

## implemented

- Next.js / TypeScript foundation, Prisma 7 with SQLite, quality scripts and CI configuration.
- Core persistence models and project foundation migration.
- Validated project create/list/open APIs, repository and service boundaries.
- Estonian project list and responsive workspace with persisted stage navigation.
- Repeatable demo-project seed and initial setup README.
- Service tests for input validation, database reconnection, stage isolation, missing projects and active-story counts.
- Browser tests for project create/open, non-linear navigation, actual server restart, reload, mobile tabs and API failure responses.
- Desktop and mobile screenshots visually reviewed; no overflow observed.

## important files

- `docs/IMPLEMENTATION_SPEC.md` — authoritative product contract.
- `prisma/schema.prisma` and `prisma/migrations/` — persistence contract.
- `src/services/projects/` — project persistence operations.
- `src/app/api/projects/` — validated project endpoints.
- `src/components/layout/` — project creation and workspace.
- `src/lib/db/client.ts` and `prisma.config.ts` — matching runtime and migration database URLs.
- `tests/projects.test.ts` — service integration tests with an isolated migrated SQLite database.
- `tests/e2e/projects.spec.ts` — production-server restart tests with an isolated temporary database.
- `playwright.config.ts` — Chromium configuration; tests own their server on port 3100.

## database changes

- Empty WP-00 baseline and WP-01 core tables.
- Generated Prisma Client and local SQLite databases are ignored by Git.
- Stage navigation changes only `currentStage` and the project timestamp.

## commands run

- `npm install` — passed; lockfile created.
- `npm ci` — passed; clean installation from lockfile.
- `npm run db:generate` — passed.
- `npx prisma migrate dev --name project_foundation` — passed on an empty local database.
- `npm run db:migrate` — passed; service and browser suites also apply migrations to fresh temporary databases.
- `npm run db:seed` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed; generates Next route types before TypeScript so a clean checkout does not depend on an earlier build.
- `npm test` — passed, 5 tests.
- `npm run build` — passed.
- `npx playwright install chromium` — passed.
- `npm run test:e2e` — passed, 2 tests, including real production-server restart.
- `git check-ignore prisma/dev.db src/generated/prisma/client.ts .local/AGENT_BUILD_SEQUENCE.md` — all correctly ignored.
- `npm audit --json` — four high-severity findings in Prisma CLI dependencies; see known issues.

## intermediate commits

- `d32fdfd` — implementation contract and repository conventions.
- `e0625f2` — application, database and quality-check foundation; most added lines are the npm lockfile.
- `7500d0a` — persistent project workspace and stage navigation.
- `b5b2d0e` — persistence and server-restart tests.

## known issues

- `npm audit` reports four high-severity entries through the development-only Prisma CLI: `prisma`, `@prisma/config`, `deepmerge-ts` (recursive graph stack exhaustion) and `mysql2` (authentication downgrade and compressed-protocol decompression). This application uses SQLite; MySQL connection paths are unused. npm proposes a downgrade to Prisma 6 rather than a compatible fix. No forced downgrade or unverified transitive override was applied. Review upstream fixes before broader deployment.
- Backlog CRUD, AI, conversation and wireframes are intentionally not implemented in agent 1. Their panels clearly identify the upcoming work.
- `recommendedNextStage` defaults to `idea`; state-based recommendation is reserved for WP-09.
- Local sandbox blocked npm registry access, server sockets and tsx IPC. These checks passed with the required execution permissions; they are environment limitations, not application failures.

## decisions or spec deviations

- None. Agent 1 stays within WP-00 and WP-01.
- `Story.requiresMockup` is included as explicitly allowed in section 12. Readiness, project-scoped story references and the single-primary-role invariant must be enforced by the services in their owning packages.

## next package starting point

- Read the implementation spec, this handoff and `.local/AGENT_BUILD_SEQUENCE.md` when available; run the existing checks before editing.
- Agent 2 starts WP-02: implement manual story, criterion and open-question management, readiness, ordering, MVP boundary and undo using the existing schema.
- Wire the backlog panel to actual stories and project-scoped service operations. Prisma must remain behind services, and manual features must work without an AI key.
- Preserve the existing project create/open and server-restart tests. Run `npm run build` before `npm run test:e2e`; browser tests start production servers and use temporary databases, never the development database.
- Continue with coherent intermediate commits; keep all commit subjects and bodies lowercase.
