# AI PM Tool

Eestikeelne projektijuhi tööruum ideest arendusvalmis backlog’ini. Agent 1 implements the foundation and persistent project workspace (WP-00 / WP-01); later work packages add backlog editing and AI proposals.

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

## Architecture and scope

Next.js App Router and React provide the interface. Validated route handlers call project services and repositories; only server code accesses Prisma and SQLite. The core database schema prepares the relationships for later work packages without implementing their workflows.

Project creation, listing, reopening, and non-linear stage navigation are implemented. Project data and the current stage persist in SQLite. The recommended stage starts at `idea`; calculating recommendations from domain state belongs to WP-09. Conversation, manual story editing, wireframes, AI, and undo are subsequent work packages and are labelled accordingly in the workspace.

The application is a single local workspace with no authentication. Do not expose it as a shared public service.

See [implementation spec](docs/IMPLEMENTATION_SPEC.md) and [agent handoff](docs/HANDOFF.md).
