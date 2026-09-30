# Final acceptance matrix

This matrix maps the mandatory evaluation flow and cross-cutting requirements to repeatable evidence. Automated commands are run from the repository root.

| Requirement | Implementation evidence | Automated evidence | Result |
| --- | --- | --- | --- |
| Install, configure, migrate and run unaided | README setup, `.env.example`, Prisma migrations | clean-checkout validation sequence below | Pass |
| Create and reopen a persistent project | project service/repository and SQLite | `projects.test.ts`; restart/reopen Playwright scenario | Pass |
| Start from one vague idea and answer with buttons | guided conversation with fixture AI | guided conversation Playwright scenario | Pass |
| Review and confirm roles | editable proposal and primary-role selection | AI service and roles browser coverage | Pass |
| Receive at least five ordered stories and add a subset | 5–8 story contract and selective confirmation | story/priority service tests and Playwright flow | Pass |
| Accept or override priority and reorder manually | priority confirmation plus backlog ordering | backlog tests and primary browser flow | Pass |
| Generate, accept/reject/edit criteria and preview a mockup | prototype proposal controls and safe renderer | AI/mockup tests and primary browser flow | Pass |
| Apply prototype atomically | transactional proposal workflow | prototype atomicity, sibling isolation and undo tests | Pass |
| Preview and apply a VAT clarification | refinement before/after controls | refinement service tests and browser flows | Pass |
| Keep other stories byte-for-byte unchanged | server allowlist and separate cross-story suggestions | refinement isolation assertions | Pass |
| Detect stale proposals and make discard a no-op | base story version and proposal status | stale/discard prototype and refinement scenarios | Pass |
| Create a grooming problem and apply one split/merge finding | manual grooming and independent findings | grooming tests and grooming browser scenario | Pass |
| Block readiness with an open question | deterministic readiness calculation | backlog readiness tests and manual browser scenario | Pass |
| Persist state and recommend the correct next step | durable artifacts and recommendation reconciliation | stage tests and reload/restart browser coverage | Pass |
| Prevent duplicate confirmation | transactional request receipts | backlog/AI idempotency tests and API browser assertion | Pass |
| Work without live AI | fixture provider and complete manual backlog | fixture suite and unavailable-AI browser scenario | Pass |
| Render responsive, keyboard-accessible workspace states | tabs, panels, status/error/loading UI | desktop/mobile Playwright assertions | Pass |
| Keep credentials and generated content safe | server-only provider, strict schemas, component renderer | AI/mockup security tests and security review | Pass with documented residual risks |

## Clean-checkout validation

From a fresh checkout with no development database:

```sh
npm ci
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The tests create isolated temporary SQLite databases and do not mutate the seeded development project. The final WP-10 execution record and exact counts are maintained in `docs/HANDOFF.md`.
