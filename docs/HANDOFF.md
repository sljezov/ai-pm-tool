# handoff

## completed work package

WP-00 / WP-01 — agent 1 implementation in progress; validation and persistence tests are not yet complete.

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

## important files

- `docs/IMPLEMENTATION_SPEC.md` — authoritative product contract.
- `prisma/schema.prisma` and `prisma/migrations/` — persistence contract.
- `src/services/projects/` — project persistence operations.
- `src/app/api/projects/` — validated project endpoints.
- `src/components/layout/` — project creation and workspace.
- `src/lib/db/client.ts` and `prisma.config.ts` — matching runtime and migration database URLs.

## database changes

- Empty WP-00 baseline and WP-01 core tables.
- Generated Prisma Client and local SQLite databases are ignored by Git.
- Stage navigation changes only `currentStage` and the project timestamp.

## commands run

- `npm install` — passed; lockfile created.
- `npm run db:generate` — passed.
- `npx prisma migrate dev --name project_foundation` — passed on an empty local database.
- Remaining validation in progress.

## known issues

- Unit and browser persistence tests still need to be implemented and run.
- npm reported four high-severity dependency findings; audit review is pending.

## decisions or spec deviations

- None. Agent 1 stays within WP-00 and WP-01.

## next package starting point

- Finish agent 1 validation and restart-persistence checks before starting WP-02.
- Agent 2 implements manual story, criterion and open-question management, readiness, ordering, MVP boundary and undo using the existing schema.
