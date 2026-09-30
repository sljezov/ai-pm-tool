# AI PM Tool

AI PM Tool is a project management workspace for turning a product idea into a development-ready backlog. The interface and project content are in Estonian by default. The product combines structured user stories, acceptance criteria, readiness checks and a clear MVP boundary. AI guidance is designed around human review and explicit confirmation.

## Requirements

- Node.js 24 LTS (Node.js 22.12 or newer is supported)
- npm, included with Node.js
- a local terminal and a modern browser

SQLite is embedded. A database server and an AI key are not required.

## Local setup

Use Node.js 24 LTS and npm. SQLite runs locally; no external database or AI key is required.

```sh
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. The seed is optional and repeatable: it creates the `Spordiklubi broneeringud` project once and never overwrites it. Prisma Client is generated during installation. Database paths are relative to the repository root, and both migrations and runtime use the same `DATABASE_URL`. The default is `file:./prisma/dev.db`.

`.env.example` is safe to commit and documents every runtime setting. `DATABASE_URL` selects the SQLite file. `AI_PROVIDER="fixture"` enables the deterministic, offline demonstration. `AI_PROVIDER="openai"` requires both server-only `OPENAI_API_KEY` and `OPENAI_MODEL`; an empty or incomplete live configuration leaves AI unavailable while manual features continue to work. Do not add secrets to `.env.example` or use a `NEXT_PUBLIC_` variable for the API key.

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

### Troubleshooting

- `npm ci` or Prisma reports an unsupported runtime: verify `node --version` is 22.12 or newer; Node.js 24 LTS is recommended.
- Prisma Client is missing: run `npm run db:generate`.
- A table does not exist or the schema is stale: confirm `.env` contains the intended `DATABASE_URL`, then run `npm run db:migrate`.
- The app opens an unexpected or empty database: relative SQLite paths are resolved from the repository root. Start commands from that directory.
- Port 3000 is busy: stop the other process or run `npm run dev -- --port 3001` and open the printed address.
- AI says it is not configured: use fixture mode, or provide all three live-provider values and restart the server. Manual backlog work remains available.
- Playwright cannot find Chromium: run `npx playwright install chromium`.
- Browser tests cannot bind port 3100: stop the process using that port and rerun `npm run test:e2e`.
- A clean local reset is needed: stop the app, move `prisma/dev.db` somewhere safe, rerun migration and seed, then restart. Moving the file preserves a recoverable backup.

## Evaluation guides

- [Usage scenario](docs/USAGE_SCENARIO.md) — one-page product walkthrough
- [Demonstration script](docs/DEMO_SCRIPT.md) — repeatable 5–10 minute fixture-AI demo
- [Development backlog](docs/DEVELOPMENT_BACKLOG.md) — delivery order, rationale and MVP line
- [Feature status](docs/FEATURE_STATUS.md) and [known AI limitations](docs/AI_LIMITATIONS.md)
- [Security review](docs/SECURITY_REVIEW.md) and [final acceptance matrix](docs/ACCEPTANCE_MATRIX.md)

## Architecture and scope

Next.js App Router and React provide the interface. Validated route handlers call project services and repositories; only server code accesses Prisma and SQLite. Domain checks are deterministic, and services own transactions and project-scoped access. Backlog state comes from SQLite rather than conversation history.

Create a project, describe its idea and navigate freely between process stages. Projects, backlog data and the selected stage persist across reloads and server restarts.

The Backlog panel supports creating and editing separate role/action/benefit fields, status, size, acceptance criteria and open questions. Reorder with up/down buttons or drag-and-drop. The MVP boundary follows its story and clears when that story is archived. The selected story persists. On mobile, open the Backlog tab.

Criteria show deterministic validation feedback. Ready status requires three passing criteria, complete story wording, resolved questions and a mockup for UI stories. Nonvisual stories can disable the mockup requirement. Failed ready transitions return all missing requirements without changing the story. Later changes that invalidate a ready story set it to `needs_clarification`. The mockup requirement applies only to stories that need a user interface.

`Võta tagasi` restores the latest backlog mutation, including criteria, questions, order and MVP boundary. Undo is one level; selecting a story does not replace the undo target. Archived stories remain for audit. Manual operations require no AI key.

The application is a single local workspace with no authentication. Do not expose it as a shared public service.

The [implementation specification](docs/IMPLEMENTATION_SPEC.md) describes the complete product, domain rules and intended workflows.

Conversation accepts a project idea and follows up with clarification questions, choices, `Muu (kirjutan ise)` and `Jäta vahele`. Answers and proposals persist across reloads. Roles can be edited, selected and assigned one primary role before confirmation. The primary role drives a proposal of five to eight ordered happy-path stories; users can add all or only selected stories. A separate priority proposal recommends one backlog story with a rationale, and the user may accept it or explicitly choose another. Generation never mutates project data: only confirmation controls apply proposals, and repeated confirmation does not duplicate changes. Client refinements support scoped before/after review.

Select a backlog story and choose `Koosta valitud loo prototüüp`, or continue from the confirmed priority recommendation. Review the safe wireframe preview, accept or reject individual criteria, edit their text and select the corresponding mockup elements. Warnings appear before confirmation; invalid text or element references block application. Optional proposed story wording applies only when selected. `Rakenda kriteeriumid ja mockup` replaces the target story's criteria and appends one mockup version atomically; `Loobu` leaves story data unchanged. If the story changed after generation, regenerate the proposal. Undo restores the previous criteria and wording and appends the previous mockup as a new current version.

After applying a prototype, enter a client clarification in the conversation or choose `Täpsusta valitud lugu`. Review the changed story fields, criteria and before/after wireframes. `Muuda` lets you edit the proposed changed areas, `Rakenda täpsustus` confirms one atomic target-story change, and `Loobu` leaves the backlog unchanged. Changes to other stories are saved only as separate pending suggestions for later review. A stale proposal must be regenerated; undo restores the story, criteria and current wireframe together while retaining version history.

Backlog grooming works manually and through the deterministic or live AI review. Select a story and choose `Jaga valitud lugu`, or select two or more stories under the merge controls. The preview shows source and result wording, criterion distribution, mockups, ordering, archive behavior and the MVP-boundary effect before confirmation. Replaced source stories are archived for audit. Split results occupy the first source position; merge removes duplicate criteria and preserves valid mockup mappings. If a replaced source anchors the MVP boundary, the boundary clears and must be set again. One undo restores the whole operation.

Choose `Vaata backlog üle` to create independent findings for oversized or duplicate stories, invalid criteria, a missing mockup and malformed Connextra wording. Each finding has its own `Rakenda leid`, `Muuda` and `Eira` controls. Applying or ignoring one finding leaves sibling findings untouched. A finding whose source story changed is rejected as stale and can be regenerated; no finding changes backlog data before confirmation.

The story inspector supports structured mockup fixtures, JSON editing, a safe preview, version history and restore as a new version. Mockups never execute generated HTML, scripts or navigation.

### AI configuration

The example environment uses `AI_PROVIDER="fixture"` for a deterministic demonstration, visibly marked as `Näidis-AI · fixture`. Fixture answers are scripted examples rather than live model interpretation. Set `AI_PROVIDER="openai"`, `OPENAI_API_KEY` and `OPENAI_MODEL` to use the live OpenAI Responses API with a model that supports structured outputs, or set `AI_PROVIDER="anthropic"`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` to use the live Anthropic Messages API instead (structured output is enforced with a forced tool call rather than a JSON-schema response format). Choose a model available to your account. Credentials stay on the server; never use a `NEXT_PUBLIC_` key variable. Restart the server after changing configuration.

Unset AI configuration keeps all manual functionality available and preserves submitted conversation text. Failed AI responses offer retry. Structured outputs are checked against strict task schemas, repaired once if invalid, and rejected completely if still invalid. Requests have a 25-second provider timeout per attempt. The live adapter sends project context and recent conversation to the configured provider with response storage disabled where the provider supports it; prompts and raw provider errors are not logged.

For an optional live-provider smoke test, set the three live AI variables for your chosen provider in `.env`, restart `npm run dev`, create a temporary project, submit one short idea and verify that a clarification card appears. Answer it, confirm the proposed roles, and reload the page to verify that the conversation and proposal status remain. Then temporarily remove the API key, restart, submit another message and verify the safe retry state without any provider details or credentials in the browser response. Restore fixture mode for the repeatable acceptance suite.
