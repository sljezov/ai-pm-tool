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

Conversation accepts a project idea and follows up with clarification questions, choices, `Muu (kirjutan ise)` and `Jäta vahele`. Answers and proposals persist across reloads. Roles can be edited, selected and assigned one primary role before confirmation. The primary role drives a proposal of five to eight ordered happy-path stories; users can add all or only selected stories. A separate priority proposal recommends one backlog story with a rationale, and the user may accept it or explicitly choose another. Generation never mutates project data: only the confirmation controls apply roles, stories or ordering, and repeated confirmation does not duplicate stories. Prototype and split/merge flows remain later work packages.

The story inspector supports structured mockup fixtures, JSON editing, a safe preview, version history and restore as a new version. Mockups never execute generated HTML, scripts or navigation.

### AI configuration

The example environment uses `AI_PROVIDER="fixture"` for a deterministic demonstration, visibly marked as `Näidis-AI · fixture`. Fixture answers are scripted examples rather than live model interpretation. Set `AI_PROVIDER="openai"`, `OPENAI_API_KEY` and `OPENAI_MODEL` to use the live OpenAI Responses API with a model that supports structured outputs. Choose a model available to your account. Credentials stay on the server; never use a `NEXT_PUBLIC_` key variable. Restart the server after changing configuration.

Unset AI configuration keeps all manual functionality available and preserves submitted conversation text. Failed AI responses offer retry. Structured outputs are checked against strict task schemas, repaired once if invalid, and rejected completely if still invalid. Requests have a 25-second provider timeout per attempt. The live adapter sends project context and recent conversation to OpenAI with response storage disabled; prompts and raw provider errors are not logged.
