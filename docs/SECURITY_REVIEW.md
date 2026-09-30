# Final security review

Review date: 2026-09-30  
Scope: application routes, persistence, AI adapter, mockup rendering, secrets, dependency advisories and automated security-oriented tests.

## Result

The local single-user MVP meets its documented security boundary. No critical application flaw or committed credential was found. It must not be exposed as a shared public service because authentication, authorization, CSRF protection and deployment hardening are outside the MVP.

## Controls verified

- Secrets are read only from server environment variables. `.env` and SQLite files are ignored; `.env.example` contains no credential.
- API and domain commands use strict Zod schemas with field, collection and identifier limits. Resource access is scoped to the route project before mutation.
- Multi-entity mutation, proposal application, idempotency receipt and undo work is transactional.
- AI output uses task-specific strict schemas, allowlisted tasks, story/version checks and one bounded repair attempt. Provider errors returned to the browser omit prompts, authorization values and stack traces.
- Live Responses API calls set `store: false`; provider and orchestration timeouts are bounded.
- Mockups accept only an allowlisted, depth/count-limited component tree. The repository contains no `dangerouslySetInnerHTML`, `eval` or `new Function` path for generated content.
- React renders user and AI strings as text. Browser coverage verifies a literal `<script>` answer does not create a script node.
- Repeated mutable requests use project-scoped idempotency keys; stale proposals and cross-project IDs fail safely.
- A tracked-file secret-pattern scan found no API key, bearer token or private-key material.

## Dependency review

`npm audit --omit=dev` reports four high-severity advisories through the Prisma CLI dependency graph (`deepmerge-ts` and `mysql2`). The project uses SQLite and does not use the affected MySQL authentication/protocol path. The proposed automated fix force-installs Prisma 6.19.3, a breaking downgrade from the locked Prisma 7 baseline, so it was not applied during WP-10. Recheck on every dependency update and move to an upstream Prisma release that removes the advisories when available.

## Residual risks and operating constraints

- No authentication or authorization: run only on a trusted local machine and bind according to the documented local commands.
- No explicit rate limiter: input sizes and AI timeouts bound individual work, but an untrusted network client could still consume resources.
- SQLite and local environment files are unencrypted at rest; filesystem access controls and backups are the operator's responsibility.
- Live AI sends selected project and recent conversation content to OpenAI. Operators must apply their own privacy, retention and data-classification policy.
- Dependency advisories above remain until a compatible upstream fix is available.
- No independent penetration test or external accessibility/security certification was performed.

## Verification evidence

- `npm run lint`
- `npm run typecheck`
- `npm test` (includes malformed output, scope, XSS-safe rendering, secret-safe errors, atomicity and idempotency cases)
- `npm run build`
- `npm run test:e2e` (includes literal script input, unavailable-provider error privacy and cross-project rejection)
- tracked-file secret-pattern scan
- `npm audit --omit=dev`
