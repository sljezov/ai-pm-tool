# AI PM Tool

AI PM Tool is a project management workspace for turning a product idea into a development-ready backlog. The interface and project content are in Estonian by default. The product combines structured user stories, acceptance criteria, readiness checks and a clear MVP boundary. AI guidance is designed around human review and explicit confirmation.

## Local setup

Use Node.js 24 LTS and npm. SQLite runs locally; no external database or AI key is required.

```sh
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. The seed is optional and repeatable. Prisma Client is generated during installation. Database paths are relative to the repository root, and both migrations and runtime use the same `DATABASE_URL`. The default is `file:./prisma/dev.db`.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

For a production run, use `npm run build` followed by `npm start`.

Browser tests use port 3100, launch and restart the production server, and migrate an isolated temporary SQLite database. Run the build first and leave that port free. Service tests also use an isolated temporary database. Neither suite changes your development project data.

If setup fails, check your Node version, run `npm run db:generate`, and confirm migrations and runtime use the same database URL. If Playwright reports a missing executable, run `npx playwright install chromium`. The local demo seed can be rerun without overwriting an existing demo project.

## Architecture and scope

Next.js App Router and React provide the interface. Validated route handlers call project services and repositories; only server code accesses Prisma and SQLite. Domain checks are deterministic, and services own transactions and project-scoped access. Backlog state comes from SQLite rather than conversation history.

Create a project, describe its idea and navigate freely between process stages. Projects, backlog data and the selected stage persist across reloads and server restarts.

The Backlog panel supports creating and editing separate role/action/benefit fields, status, size, acceptance criteria and open questions. Reorder with up/down buttons or drag-and-drop. The MVP boundary follows its story and clears when that story is archived. The selected story persists. On mobile, open the Backlog tab.

Criteria show deterministic validation feedback. Ready status requires three passing criteria, complete story wording, resolved questions and a mockup for UI stories. Nonvisual stories can disable the mockup requirement. Failed ready transitions return all missing requirements without changing the story. Later changes that invalidate a ready story set it to `needs_clarification`. The mockup requirement applies only to stories that need a user interface.

`Võta tagasi` restores the latest backlog mutation, including criteria, questions, order and MVP boundary. Undo is one level; selecting a story does not replace the undo target. Archived stories remain for audit. Manual operations require no AI key.

The application is a single local workspace with no authentication. Do not expose it as a shared public service.

The [implementation specification](docs/IMPLEMENTATION_SPEC.md) describes the complete product, domain rules and intended workflows.

AI conversation, proposal generation, wireframe rendering and story split/merge are not available yet. These controls are identified in the workspace. Manual backlog management works independently of these capabilities.
