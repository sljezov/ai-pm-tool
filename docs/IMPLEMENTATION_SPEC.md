# AI PM Tool — implementation spec

Status: proposed implementation baseline  
Language: application UI and generated project content in Estonian by default  
Purpose: authoritative plan for sequential implementation by multiple agents

## 1. How to use this document

This document is the shared contract for all implementation agents. Work packages in section 14 must be completed in order. Only one agent works on the repository at a time.

Before starting a work package, an agent must:

1. read this document and the repository `AGENTS.md`;
2. inspect the current implementation and the previous package's handoff notes;
3. run the existing validation commands;
4. limit changes to the active work package unless a prerequisite is broken;
5. update this document only when an agreed contract genuinely changes;
6. leave the repository in a passing state and complete the handoff checklist.

All Git commit subjects and bodies must be lowercase.

If implementation and this document disagree, do not silently invent a third behavior. Prefer the documented behavior, or record the necessary decision in section 17 before changing the contract.

## 2. Product goal

The application helps a project manager turn a client's vague product idea into a shared, visually reviewable, development-ready backlog.

The operating principle is:

> AI guides the process; the human decides.

AI may ask questions, recommend next steps, and prepare structured proposals. AI must never add or modify backlog data without explicit user confirmation.

The primary end-to-end flow is:

1. create a project;
2. enter one vague project description;
3. answer one to three AI clarification questions using suggested options;
4. select proposed user roles;
5. review at least five user stories ordered by the main role's happy path;
6. add selected stories to the backlog;
7. review AI's recommendation for the most important story;
8. generate acceptance criteria and a wireframe for that story;
9. accept, reject, or edit individual criteria before applying them;
10. enter a client clarification;
11. preview the resulting story, criteria, and wireframe changes;
12. explicitly apply or discard the proposal;
13. review the backlog and apply an AI grooming proposal;
14. close and reopen the project with all data and the correct next step preserved.

## 3. Scope

### 3.1 Submission MVP

The submission MVP includes:

- persistent project creation and project list;
- guided conversation starting from free text;
- 1–3 clarification questions with choices, `Other`, and `Skip`;
- editable role proposals;
- at least five happy-path story proposals;
- selective confirmation into the backlog;
- AI priority recommendation and manual reordering;
- acceptance-criteria proposal with per-item accept, edit, and reject controls;
- structured, safely rendered wireframes;
- client clarification with before/after preview;
- server-enforced single-story mutation scope;
- wireframe version history;
- manual backlog CRUD and reordering without AI;
- MVP boundary;
- Definition of Ready enforcement;
- one-level undo of the latest applied mutation;
- manual split/merge and AI grooming findings;
- persistent conversation and process stage;
- useful AI failure states and retry;
- automated tests for critical invariants;
- README, `.env.example`, development backlog, demo script, and known limitations.

### 3.2 Explicit non-goals

The following are not required for the submission MVP:

- authentication or multi-user authorization;
- real-time collaboration;
- production billing or subscriptions;
- Jira or GitHub synchronization;
- public share links;
- speech input;
- polished high-fidelity design generation;
- arbitrary AI-generated HTML or JavaScript;
- multiple simultaneous happy-path story maps;
- semantic version merging between concurrent users.

Exports may be added only after all mandatory acceptance scenarios pass.

## 4. Chosen technical baseline

Use one TypeScript web application:

- Next.js with the App Router;
- React;
- Prisma;
- SQLite for local persistence and evaluator setup;
- Zod for HTTP input and AI output validation;
- a provider-independent server-side AI adapter;
- Vitest for unit and service tests;
- Playwright for critical browser flows;
- application-owned React components for wireframe rendering.

Do not expose the AI key to browser code. Do not call the AI provider directly from a client component.

SQLite is chosen for a low-friction local demonstration. Database access must remain behind services so that replacing SQLite with PostgreSQL does not require rewriting UI or domain logic.

Package versions are fixed by the committed lockfile. An implementation agent may add a dependency only when it removes more complexity than it adds.

## 5. Application structure

Use this target structure unless the framework bootstrap requires a small variation:

```text
src/
  app/
    api/
    projects/
    page.tsx
  components/
    backlog/
    conversation/
    layout/
    mockup/
    proposals/
  domain/
    readiness/
    criteria/
    proposals/
    stages/
  lib/
    ai/
    db/
    validation/
  services/
    ai-orchestration/
    projects/
    stories/
    proposals/
    undo/
prisma/
  schema.prisma
  migrations/
tests/
  e2e/
  fixtures/
docs/
```

Architectural boundaries:

- UI components never write to Prisma directly.
- Route handlers validate input and call services.
- Services own transactions and domain invariants.
- AI orchestration produces proposals, not direct domain mutations.
- Domain checks are deterministic and independently testable.
- Backlog state comes from the database, never by replaying chat messages.

## 6. Core terminology and enums

### 6.1 Project stage

```ts
type ProjectStage =
  | "idea"
  | "roles"
  | "stories"
  | "priorities"
  | "prototype"
  | "refinements"
  | "grooming";
```

`currentStage` is the stage currently open in the UI. `recommendedNextStage` is the server's recommendation. Navigation is non-linear: a user may revisit or skip a stage.

UI labels:

- Idee
- Rollid
- Lood
- Prioriteedid
- Kriteeriumid ja mockup
- Täpsustused
- Groomimine

### 6.2 Story status

```ts
type StoryStatus =
  | "idea"
  | "needs_clarification"
  | "reviewed"
  | "ready_for_development";
```

UI labels:

- Idee
- Vajab täpsustamist
- Läbivaadatud
- Valmis arenduseks

### 6.3 Origin

```ts
type Origin = "ai" | "manual";
```

### 6.4 Proposal status

```ts
type ProposalStatus = "pending" | "applied" | "rejected" | "superseded";
```

## 7. Persistence model

The exact Prisma syntax is left to implementation, but the following fields and relationships are contractual.

### 7.1 Project

- `id`
- `name`
- `description`
- `currentStage`
- `recommendedNextStage`
- `selectedStoryId`, nullable
- `mvpBoundaryAfterStoryId`, nullable
- `createdAt`
- `updatedAt`

`mvpBoundaryAfterStoryId` means the referenced story is the last story above the MVP line. When the story is moved, the line moves with it. If that story is deleted, clear the boundary and ask the user to set it again.

### 7.2 ProjectRole

- `id`
- `projectId`
- `name`
- `isPrimary`
- `origin`
- `position`

Exactly zero or one roles may be primary. A primary role is required before happy-path generation but the user may bypass that requirement by explicitly choosing a role during generation.

### 7.3 Story

- `id`
- `projectId`
- `role`
- `action`
- `benefit`
- `status`
- `position`
- `size`, nullable: `S`, `M`, or `L`
- `origin`
- `version`, integer starting at 1
- `archivedAt`, nullable
- `createdAt`
- `updatedAt`

The displayed Connextra title is derived as:

```text
[role]na soovin [action], et [benefit].
```

The three parts are stored separately and are individually editable. Archived stories are excluded from the normal backlog but retained for audit and undo.

### 7.4 AcceptanceCriterion

- `id`
- `storyId`
- `text`
- `position`
- `origin`
- `validationStatus`: `pass`, `warning`, or `fail`
- `validationMessagesJson`
- `mockupElementIdsJson`
- `createdAt`
- `updatedAt`

Only criteria belonging to an applied proposal become story criteria.

### 7.5 OpenQuestion

- `id`
- `storyId`
- `text`
- `resolvedAt`, nullable
- `createdAt`

Only unresolved questions block readiness.

### 7.6 MockupVersion

- `id`
- `storyId`
- `version`
- `name`
- `structureJson`
- `source`: `ai`, `manual`, or `refinement`
- `createdAt`

The highest version is current. A previous version can be restored by creating a new version containing the old structure; history is never overwritten.

### 7.7 ConversationMessage

- `id`
- `projectId`
- `role`: `user`, `assistant`, or `system_event`
- `messageType`
- `content`
- `structuredPayloadJson`, nullable
- `createdAt`

Conversation is for continuity and display. It is not authoritative domain state.

### 7.8 Proposal

- `id`
- `projectId`
- `targetStoryId`, nullable
- `type`
- `status`
- `baseStoryVersion`, nullable
- `inputText`, nullable
- `beforeSnapshotJson`, nullable
- `afterSnapshotJson`
- `createdAt`
- `resolvedAt`, nullable

Story-changing proposals must contain both `targetStoryId` and `baseStoryVersion`.

### 7.9 ChangeEvent

- `id`
- `projectId`
- `eventType`
- `entityType`
- `entityId`
- `beforeSnapshotJson`
- `afterSnapshotJson`
- `createdAt`
- `undoneAt`, nullable

One user-confirmed operation creates one logical change event, even when it changes the story, criteria, and mockup together.

## 8. Wireframe contract

AI returns a component tree, never executable HTML.

```ts
type MockupDocument = {
  schemaVersion: 1;
  screenName: string;
  description?: string;
  elements: MockupElement[];
};

type MockupElement = {
  id: string;
  type:
    | "heading"
    | "text"
    | "image_placeholder"
    | "card"
    | "list"
    | "form"
    | "field"
    | "button"
    | "navigation"
    | "table"
    | "alert"
    | "confirmation"
    | "container";
  label?: string;
  text?: string;
  props?: Record<string, string | number | boolean>;
  actions?: Array<{ label: string; action: string }>;
  children?: MockupElement[];
};
```

Validation rules:

- all element IDs are unique within a document;
- nesting depth and total element count are bounded;
- unknown element types and unknown executable properties are rejected;
- text is rendered as text, not injected as HTML;
- URLs are either omitted in MVP or validated against an allowlist of safe schemes;
- no script, event handler, CSS string, raw HTML, iframe, or external embed is accepted.

UI-related criteria should reference one or more `mockupElementIds`. Non-visual behavior such as sending email does not need a mockup mapping.

## 9. AI integration contract

### 9.1 Provider boundary

```ts
interface AiProvider {
  generateStructured<T>(request: {
    task: AiTask;
    systemInstructions: string;
    context: unknown;
    outputSchema: unknown;
  }): Promise<T>;
}
```

The provider implementation exists only in server-side code. The application also has a deterministic fixture provider for automated tests and reliable demonstrations. Fixture mode must be visibly marked in development and must not pretend to be a live AI response.

### 9.2 AI task types

```ts
type AiTask =
  | "clarify_idea"
  | "propose_roles"
  | "propose_stories"
  | "recommend_priority"
  | "propose_prototype"
  | "propose_refinement"
  | "review_backlog";
```

### 9.3 Common response envelope

Every AI response is validated as:

```ts
type AiResponse<T> = {
  message: string;
  payload: T;
  nextActions: Array<{
    id: string;
    label: string;
    action: string;
  }>;
};
```

There must be between one and four next actions. A response without a valid next action is rejected and repaired.

### 9.4 Context sent to AI

Build context from current database state for every request. Include only what the task needs:

- project name and description;
- current and recommended stage;
- current roles;
- active backlog in order;
- criteria, open questions, and current mockup for relevant stories;
- selected story ID;
- latest relevant conversation turns;
- explicit mutation boundaries.

Do not assume chat history contains current story wording or order.

### 9.5 Validation and retry

For every AI call:

1. parse the provider response;
2. validate it with the task-specific Zod schema;
3. run domain checks such as target-story scope;
4. if invalid, make one repair attempt containing validation errors;
5. if repair fails, store no proposal and return a user-friendly retry state.

Do not render partially valid payloads.

### 9.6 Structured task payloads

Clarification payload:

```ts
type ClarificationPayload = {
  questions: Array<{
    id: string;
    text: string;
    selectionMode: "single" | "multiple";
    options: Array<{ id: string; label: string }>;
  }>;
};
```

There must be one to three questions. The UI always adds `Muu (kirjutan ise)` and `Jäta vahele`; the model does not need to generate them.

Story proposal payload:

```ts
type StoryProposalPayload = {
  primaryRole: string;
  stories: Array<{
    temporaryId: string;
    role: string;
    action: string;
    benefit: string;
    rationale?: string;
    happyPathOrder: number;
    selectedByDefault: boolean;
  }>;
};
```

The requested default range is five to eight stories. A smaller result is invalid unless the user explicitly asked for fewer.

Prototype proposal payload:

```ts
type PrototypeProposalPayload = {
  targetStoryId: string;
  baseStoryVersion: number;
  proposedStory?: {
    role: string;
    action: string;
    benefit: string;
  };
  criteria: Array<{
    temporaryId: string;
    text: string;
    mockupElementIds: string[];
  }>;
  mockup: MockupDocument;
};
```

Refinement payload uses the same target/version fields and contains explicit before/after values for each changed area. It may omit unchanged areas.

Grooming payload:

```ts
type GroomingPayload = {
  findings: Array<{
    temporaryId: string;
    type:
      | "oversized_story"
      | "duplicate_stories"
      | "invalid_criteria"
      | "missing_mockup"
      | "invalid_connextra";
    affectedStoryIds: string[];
    problem: string;
    reasoning: string;
    proposal: unknown;
  }>;
};
```

Each finding becomes an independent pending proposal. Applying one finding must not silently apply the others.

## 10. Domain invariants

These rules are enforced in services and tested independently of the UI:

1. AI output never directly mutates the backlog.
2. A pending proposal is applied only through an explicit confirmation endpoint.
3. A story proposal may mutate only its `targetStoryId`.
4. The target story's current version must equal the proposal's `baseStoryVersion`.
5. Applying a story mutation increments the story version once.
6. Refinement never mutates another story, its criteria, or its mockups.
7. Cross-story effects are emitted as separate pending proposals.
8. Every AI payload passes structural and domain validation before display.
9. Manual backlog operations work when no AI provider is configured.
10. Mockup history is append-only.
11. Ready status is assigned only after a fresh readiness calculation.
12. A story with unresolved open questions cannot be ready.
13. Undo restores the complete previous snapshot of the latest non-undone change event.
14. Story order remains contiguous after add, move, archive, split, merge, and undo.
15. Deleting the story anchoring the MVP boundary clears the boundary.
16. No mockup content can execute arbitrary browser code.

## 11. Acceptance-criterion validation

Each criterion describes one condition that can be answered yes or no during verification.

The deterministic checker returns:

```ts
type CriterionCheck = {
  status: "pass" | "warning" | "fail";
  messages: Array<{
    code: string;
    message: string;
  }>;
};
```

Minimum rules:

- fail empty or extremely short text;
- warn on subjective words such as `kasutajasõbralik`, `kiire`, `lihtne`, `mugav`, `intuitiivne`, `selge`, `efektiivne`, and `kaasaegne`;
- warn when wording appears to combine independent conditions;
- warn when a UI criterion references a missing mockup element;
- fail references to nonexistent mockup element IDs;
- avoid treating every occurrence of `ja` as an automatic failure.

AI performs an additional semantic self-check, but deterministic checks remain authoritative for application behavior.

## 12. Definition of Ready

A story can enter `ready_for_development` only when all conditions pass:

- `role`, `action`, and `benefit` are non-empty and form a Connextra statement;
- the story has at least three acceptance criteria;
- every criterion has deterministic status `pass`;
- a UI-facing story has at least one mockup version;
- all referenced mockup element IDs exist in the current mockup;
- the story has no unresolved open questions.

UI-facing is a stored or derived boolean decided by the prototype/readiness service. For MVP it may be stored as `requiresMockup` on Story if reliable derivation becomes ambiguous.

When a user attempts to set ready status and checks fail:

- keep the previous status;
- return every failed requirement;
- show direct navigation to the missing criteria, mockup, or open questions.

Setting `needs_clarification` always succeeds and necessarily means the story is not ready.

## 13. Primary UX specification

### 13.1 Project list

- Empty state explains what a project contains.
- `Loo projekt` opens a form for name and short description.
- Submitting creates the project and opens the idea stage.
- Existing cards show project name, last update, current stage, and backlog count.

### 13.2 Project workspace

Desktop layout:

- left: stage navigation;
- center: conversation and structured proposal cards;
- right: backlog or selected-story inspector.

On narrow screens, these become tabs. Functionality must remain available without drag-and-drop; reordering needs accessible move-up and move-down controls.

### 13.3 Conversation rules

- Free text input is always visible and enabled except during the current request submission.
- Choice buttons supplement rather than replace free text.
- Every AI response ends with one to four next actions.
- Submitted user selections appear in conversation history.
- Retry does not duplicate confirmed domain changes.

### 13.4 Proposal rules

- Unconfirmed cards are visually marked as proposals.
- Story proposal cards are selected by default but individually deselectable.
- Criteria allow accept, edit, and reject before batch confirmation.
- Refinements show changed fields and before/after wireframes.
- `Rakenda`, `Muuda`, and `Loobu` are explicit.
- Closing a proposal without applying it does not change domain data.

### 13.5 Backlog

- Create, edit, archive/delete, reorder, and select stories manually.
- Show status, size, origin, criterion count, mockup presence, and open-question count.
- Show the MVP line between ordered stories.
- Support drag-and-drop plus keyboard-accessible ordering buttons.
- Show an undo action after a successful mutation.
- Manual functionality does not disappear when AI is unavailable.

### 13.6 Story inspector

- Edit Connextra parts separately.
- Manage criteria and see validation feedback.
- Manage open questions.
- View current mockup and version history.
- Request prototype or refinement.
- Attempt status changes and see readiness failures.

### 13.7 Grooming

Manual actions:

- edit wording or criteria;
- split a story;
- select overlapping stories and merge them;
- reorder;
- mark as needing clarification;
- add an open question.

AI review cards show problem, reasoning, affected stories, and concrete proposal. Split preview shows new stories and criterion allocation. Merge preview shows the combined story and deduplicated criteria.

## 14. Sequential implementation work packages

Each package must be completed and handed off before the next starts.

### WP-00 — repository bootstrap and quality gates

Goal: create a runnable, testable application skeleton.

Deliverables:

- Next.js TypeScript application;
- lint, typecheck, unit-test, build, and e2e scripts;
- Prisma with SQLite and an initial empty migration;
- `.env.example` without secrets;
- base folder structure from section 5;
- minimal home page;
- CI workflow running lint, typecheck, tests, and build;
- initial README setup instructions.

Acceptance:

- clean install succeeds from the lockfile;
- database migration succeeds on an empty database;
- all validation scripts pass;
- no secret or local database file is tracked.

Do not implement product flows in this package.

### WP-01 — persistence and project shell

Goal: create, list, reopen, and navigate persistent projects.

Deliverables:

- core Prisma models and migration;
- project repository and service;
- project list, creation form, and workspace shell;
- visible stage bar with non-linear navigation;
- persisted `currentStage` and `recommendedNextStage`;
- seed command with one sample project;
- service and browser tests for restart-safe persistence.

Acceptance:

- a created project survives a server restart;
- reopening lands on the persisted stage;
- changing stage does not delete or fabricate other state.

### WP-02 — manual backlog foundation

Goal: make backlog management fully usable without AI.

Deliverables:

- manual story CRUD;
- separate role/action/benefit editing;
- status, size, origin, ordering, and open questions;
- accessible reordering and drag-and-drop if practical;
- MVP boundary;
- criterion CRUD with deterministic validation;
- readiness service and guarded ready transition;
- change events and one-level undo;
- tests for ordering, boundary behavior, validation, readiness, and undo.

Acceptance:

- all manual actions work with no AI key;
- invalid stories cannot become ready and return specific reasons;
- marking a story as needing clarification blocks readiness;
- undo restores the previous complete state.

### WP-03 — safe mockups and versioning

Goal: support manually seeded structured wireframes independently of AI.

Deliverables:

- `MockupDocument` schema and validation;
- safe component renderer;
- story-to-mockup association;
- criterion-to-element references;
- current version and history view;
- restore-as-new-version operation;
- representative fixture documents;
- security and rendering tests.

Acceptance:

- unsupported or executable content is rejected;
- older versions remain available after edits and restores;
- missing criterion element references are reported.

### WP-04 — AI infrastructure and guided clarification

Goal: establish the validated provider pipeline and first guided steps.

Deliverables:

- server-only `AiProvider` interface and live provider implementation;
- deterministic fixture provider;
- Zod schemas and one repair attempt;
- clarification and role-proposal tasks;
- conversation persistence;
- option buttons plus Other and Skip;
- free-text interpretation path;
- loading, retry, and unavailable states;
- next-action rendering;
- tests proving invalid output never reaches the UI as a valid proposal.

Acceptance:

- one vague sentence results in at least one clarification question;
- every question has choice interaction, Other, and Skip;
- AI failure leaves manual project features operational;
- API responses never expose the provider key.

### WP-05 — story proposals and priority

Goal: create the first AI-assisted backlog.

Deliverables:

- role confirmation and primary-role selection;
- happy-path story generation;
- selectable story proposal cards;
- explicit `Lisa kõik`, `Lisa valitud`, and regenerate actions;
- transactional confirmation into the backlog;
- priority recommendation with rationale;
- accept recommendation or select another story;
- stage and next-step updates;
- tests for no mutation before confirmation and correct ordering afterward.

Acceptance:

- default generation contains at least five ordered stories;
- deselected stories are not added;
- retrying confirmation does not duplicate stories;
- AI recommendation does not reorder without confirmation.

### WP-06 — criteria and prototype proposal

Goal: enrich one selected story with criteria and a wireframe.

Deliverables:

- prototype AI task and schemas;
- per-criterion accept, edit, and reject state;
- criterion warnings before confirmation;
- wireframe preview using the safe renderer;
- atomic confirmation of selected criteria and mockup version;
- optional proposed story wording preview;
- mapping UI criteria to mockup elements;
- stale-version rejection;
- integration and browser tests.

Acceptance:

- the user can accept some criteria, reject one, and edit one;
- no criterion or mockup is stored before confirmation;
- confirmed criteria and wireframe are mutually consistent;
- another story is never changed.

At the end of this package the first complete vertical slice exists.

### WP-07 — client refinements and previews

Goal: update one story safely from a client's free-text clarification.

Deliverables:

- refinement AI task;
- before/after story, criteria, and wireframe preview;
- apply, edit, and discard flows;
- server allowlist for mutable entity and fields;
- atomic apply with one change event;
- new mockup version on every applied wireframe change;
- separate pending suggestions for cross-story impacts;
- stale proposal handling;
- tests for story isolation and undo.

Acceptance:

- an applied clarification is visible in the relevant story and mockup;
- other stories remain byte-for-byte unchanged;
- discard changes nothing;
- undo restores story, criteria, and current mockup together.

### WP-08 — manual and AI grooming

Goal: review backlog quality and safely apply split/merge proposals.

Deliverables:

- manual split and merge;
- AI backlog review task;
- findings for oversized, duplicate, invalid criteria, missing mockup, and malformed Connextra stories;
- independent apply/edit/ignore controls;
- detailed split and merge previews;
- criterion distribution and deduplication;
- archive strategy for replaced source stories;
- ordering, MVP boundary, and undo behavior;
- service and browser tests.

Acceptance:

- an intentionally oversized or duplicate story produces a useful finding in fixture mode;
- no finding mutates data before confirmation;
- applying one finding does not apply sibling findings;
- split creates valid ordered stories;
- merge preserves unique criteria and archives sources;
- undo reverses the whole operation.

### WP-09 — recovery, continuity, and product hardening

Goal: make the full flow reliable for evaluation.

Deliverables:

- recommended-next-step calculation based on actual project state;
- resume card when reopening a project;
- request idempotency where double submission is possible;
- accessible error and empty states;
- responsive workspace tabs;
- loading and disabled states;
- database transaction review;
- AI timeout and malformed-response recovery;
- full acceptance-test browser suite using fixture AI;
- live-provider smoke-test instructions.

Acceptance:

- reload and restart preserve backlog, conversation, wireframes, proposals, and stages;
- reopen offers a contextually correct next step;
- double-clicking confirm does not duplicate changes;
- the mandatory flow passes without manually writing a story or criterion from scratch.

### WP-10 — documentation and demonstration package

Goal: make the repository evaluable without developer assistance.

Deliverables:

- complete README setup and troubleshooting;
- `.env.example` explanation;
- one-page usage scenario;
- development backlog with ordering rationale and MVP line;
- feature status: working, partial, and not implemented;
- known AI limitations;
- 5–10 minute demonstration script;
- sample project or repeatable seed;
- final security review;
- final acceptance matrix.

Acceptance:

- a new evaluator can install, configure, migrate, and run from README alone;
- demo script covers every mandatory evaluation action;
- all automated validation passes from a clean checkout.

### WP-11 — optional extensions

Start only after WP-10 passes:

- Markdown or CSV export;
- criterion hover highlighting its mockup element;
- shareable read-only link;
- separate story maps per role;
- speech input.

Each optional feature must be independently removable and must not weaken core invariants.

## 15. Test strategy and acceptance matrix

### 15.1 Required validation commands

WP-00 defines the exact script names. The target interface is:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Every agent runs all relevant fast checks. Agents changing end-to-end behavior also run the affected Playwright scenarios. WP-09 and WP-10 run the full suite.

### 15.2 Critical service tests

- applying a proposal requires pending status;
- applying twice is idempotent or returns a safe conflict;
- stale story version rejects apply;
- target-story allowlist rejects cross-story patches;
- ready transition reports all missing requirements;
- reorder creates contiguous positions;
- MVP boundary survives reorder and clears on anchor deletion;
- mockup versions are append-only;
- split and merge preserve or deliberately reassign criteria;
- undo restores multi-entity operations atomically;
- malformed AI output is repaired once and then fails safely.

### 15.3 Mandatory browser scenario

The primary Playwright scenario must:

1. create a project;
2. enter a vague sports-club idea;
3. answer a clarification question using buttons;
4. confirm roles;
5. receive at least five ordered stories;
6. deselect one and add the rest;
7. accept or change the priority recommendation;
8. manually reorder a story;
9. generate criteria and a mockup;
10. accept some criteria, reject one, and edit one;
11. apply the prototype;
12. enter a VAT-related client clarification;
13. inspect and apply the before/after proposal;
14. verify the selected story and mockup changed while another story did not;
15. create an intentionally oversized or duplicate story;
16. run AI grooming and apply a split or merge;
17. add an open question and verify ready status is blocked;
18. reload the project and verify persisted state and suggested next step.

Use fixture AI for this deterministic scenario. Keep a shorter optional smoke test for the live provider.

## 16. Security and privacy requirements

- AI credentials exist only in environment variables and server memory.
- `.env*` files containing real values and SQLite database files are ignored by Git.
- browser bundles and API responses never contain credentials.
- all route inputs are validated.
- all resource lookups are scoped by project ID even before authentication exists.
- wireframes render only application-owned components.
- no `dangerouslySetInnerHTML` is used for AI content.
- text content is length-limited before storage and before AI submission.
- AI errors shown to users do not reveal prompts, secrets, or provider stack traces.
- mutation routes use transactions for multi-entity operations.
- logs avoid full user prompts when they may contain client-sensitive information.

## 17. Decision log

Record contract-level decisions here. Small implementation details belong in code or normal commits.

### D-001 — structured mockups

Decision: AI produces a validated component tree, not HTML.

Reason: it is safer, easier to test, version, diff, and map to acceptance criteria.

### D-002 — local persistence

Decision: use SQLite for the submission version behind Prisma services.

Reason: evaluator setup and persistence across restarts are more important than multi-user scale.

### D-003 — no authentication in MVP

Decision: the application behaves as a single local workspace.

Reason: authentication is not required by the acceptance test and would delay the core workflow.

### D-004 — event snapshots for undo

Decision: store before and after snapshots for confirmed mutations.

Reason: one-level undo must cover atomic changes across stories, criteria, and mockup versions.

### D-005 — deterministic AI fixtures

Decision: automated tests and the reliable demo path use a visibly marked fixture provider.

Reason: core acceptance behavior must be repeatable when an external provider is slow or unavailable.

## 18. Agent handoff template

At the end of every work package, add or update `docs/HANDOFF.md` with:

```md
# handoff

## completed work package

WP-XX — name

## implemented

- concise list

## important files

- path — responsibility

## database changes

- migrations and compatibility notes

## commands run

- command — result

## known issues

- issue or `none`

## decisions or spec deviations

- decision and reason, or `none`

## next package starting point

- concrete first steps
```

An agent must not claim a package is complete if required tests fail. If blocked, leave the current state usable, document the exact blocker, and do not begin the next package.

## 19. Global Definition of Done

The project is ready for submission when:

- WP-00 through WP-10 are accepted;
- all mandatory browser actions work primarily through offered choices;
- the complete workflow works using fixture AI and has a documented live-provider path;
- no AI proposal changes data without confirmation;
- single-story refinements cannot mutate other stories;
- readiness, persistence, undo, and safe mockup rendering are verified by tests;
- server restart preserves all required data;
- README, environment example, development backlog, demo script, feature status, and AI limitations are present;
- the repository contains a meaningful sequence of lowercase Git commits;
- a clean checkout passes the documented validation commands.
