import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createDatabaseClient } from "@/lib/db/client";
import { storyService } from "@/services/stories/service";
import { mockupFixtures } from "@/domain/mockup/document";
import { conversationService } from "@/services/ai-orchestration/service";
import { proposalWorkflowService } from "@/services/proposals/workflow";
import { FixtureAiProvider, generateValidated, AiInvalidOutputError, type AiRequest } from "@/lib/ai/provider";
import { replacementContent } from "@/services/grooming/service";
import { backlogSnapshot } from "@/services/stories/service";
const input = { role: "Liige", action: "broneerida treeningu", benefit: "koht oleks tagatud", status: "idea", size: null, requiresMockup: false };
describe("grooming invariants", () => {
 let directory: string; let client: ReturnType<typeof createDatabaseClient>;
 beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), "ai-pm-grooming-")); const databasePath = join(directory, "test.db"); await writeFile(databasePath, ""); const url = `file:${databasePath}`;
  execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" }); client = createDatabaseClient(url);
 }, 30_000);
 afterAll(async () => { await client?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });
 const setup = async () => { const project = await client.project.create({ data: { name: "Backlog", description: "" } }); return { id: project.id, service: storyService(client) }; };
 it("splits atomically with distributed criteria, archived history, contiguous order, MVP reset and complete undo", async () => {
  const { id, service } = await setup();
  const first = (await service.mutate(id, { type: "create_story", ...input, action: "luua konto ja kinnitada konto", size: "L", requiresMockup: true })).stories[0];
  await service.mutate(id, { type: "save_mockup", storyId: first.id, name: "Konto", document: mockupFixtures.booking });
  for (const text of ["Nupp salvestab konto.", "Nupp kinnitab konto."]) await service.mutate(id, { type: "create_criterion", storyId: first.id, text, mockupElementIds: ["book"] });
  await service.mutate(id, { type: "create_question", storyId: first.id, text: "Kas konto vajab e-posti?" });
  await service.mutate(id, { type: "create_story", ...input, action: "vaadata kontot" });
  await service.mutate(id, { type: "select", storyId: first.id });
  const before = await service.mutate(id, { type: "boundary", storyId: first.id });
  const target = before.stories[0]; const sibling = before.stories[1];
  const operation = { type: "split_story", sources: [{ storyId: target.id, version: target.version }], results: [{ role: "Liige", action: "luua konto", benefit: "konto säilib", criterionIds: [target.criteria[0].id] }, { role: "Liige", action: "kinnitada konto", benefit: "konto on kinnitatud", criterionIds: [target.criteria[1].id] }] };
  const events = await client.changeEvent.count({ where: { projectId: id } });
  const after = await service.mutate(id, operation);
  expect(after.stories.map(item => item.position)).toEqual([0, 1, 2]);
  expect(after.stories.slice(0, 2).map(item => item.criteria.length)).toEqual([1, 1]);
  expect(after.stories[2].id).toBe(sibling.id);
  expect(after.stories[0].criteria[0].mockupElementIds).toEqual(["book"]);
  expect(after.stories[0].mockupVersions[0].structureJson).toBe(target.mockupVersions[0].structureJson);
  expect(after.stories[1].openQuestions[0].text).toBe(target.openQuestions[0].text);
  expect(after.mvpBoundaryAfterStoryId).toBeNull(); expect(after.selectedStoryId).toBe(after.stories[0].id);
  expect((await client.story.findUniqueOrThrow({ where: { id: target.id } })).archivedAt).not.toBeNull();
  expect(await client.changeEvent.count({ where: { projectId: id } })).toBe(events + 1);
  expect((await service.mutate(id, { type: "undo" })).stories).toEqual(before.stories);
  expect((await service.get(id)).mvpBoundaryAfterStoryId).toBe(first.id);
  await expect(service.mutate(id, operation)).resolves.toBeDefined();
 });
 it("merges nonadjacent sources with deduplication, collision-safe references and one undo", async () => {
  const { id, service } = await setup();
  for (let n = 0; n < 3; n++) await service.mutate(id, { type: "create_story", ...input, action: n === 1 ? "teine tegevus" : "broneerida" });
  const rows = (await service.get(id)).stories;
  for (const story of [rows[0], rows[2]]) {
    await service.mutate(id, { type: "save_mockup", storyId: story.id, name: "Vaade", document: mockupFixtures.booking });
    await service.mutate(id, { type: "create_criterion", storyId: story.id, text: "Nupp salvestab broneeringu.", mockupElementIds: ["book"] });
  }
  await service.mutate(id, { type: "create_criterion", storyId: rows[2].id, text: "Teenus saadab kinnituse e-postiga." });
  const before = await service.mutate(id, { type: "boundary", storyId: rows[1].id });
  const sources = [before.stories[0], before.stories[2]];
  const after = await service.mutate(id, { type: "merge_stories", sources: sources.map(story => ({ storyId: story.id, version: story.version })), results: [{ role: "Liige", action: "broneerida", benefit: "koht säilib", criterionIds: sources.flatMap(story => story.criteria.map(item => item.id)) }] });
  expect(after.stories).toHaveLength(2); expect(after.stories[0].criteria).toHaveLength(2);
  expect(after.stories[0].criteria[0].mockupElementIds).toHaveLength(2);
  expect(after.stories[0].criteria.every(item => item.check.status === "pass")).toBe(true);
  expect(after.stories[1]).toEqual({ ...before.stories[1], position: 1 });
  expect(after.mvpBoundaryAfterStoryId).toBe(rows[1].id);
  expect((await service.mutate(id, { type: "undo" })).stories).toEqual(before.stories);
 });
 it("rejects stale, cross-project, repeated or lost criteria and malformed wording without mutation", async () => {
  const { id, service } = await setup(); const other = await setup();
  const target = (await service.mutate(id, { type: "create_story", ...input })).stories[0];
  const foreign = (await service.mutate(other.id, { type: "create_story", ...input })).stories[0];
  const before = await service.mutate(id, { type: "create_criterion", storyId: target.id, text: "Teenus salvestab konto." });
  const story = before.stories[0];
  const result = { role: "Liige", action: "luua konto", benefit: "konto säilib", criterionIds: [story.criteria[0].id] };
  for (const command of [
    { type: "split_story", sources: [{ storyId: foreign.id, version: foreign.version }], results: [result, { ...result, criterionIds: [] }] },
    { type: "split_story", sources: [{ storyId: target.id, version: target.version }], results: [result, { ...result, criterionIds: [] }] },
    { type: "split_story", sources: [{ storyId: story.id, version: story.version }], results: [result, result] },
    { type: "split_story", sources: [{ storyId: story.id, version: story.version }], results: [{ ...result, criterionIds: [] }, { ...result, criterionIds: [] }] },
    { type: "split_story", sources: [{ storyId: story.id, version: story.version }], results: [{ ...result, role: "" }, { ...result, criterionIds: [] }] },
  ]) { await expect(service.mutate(id, command)).rejects.toBeDefined(); expect(await service.get(id)).toEqual(before); }
 });
 it("reviews real fixture state, independently applies/ignores findings, rejects stale siblings and retries idempotently", async () => {
  const { id, service } = await setup();
  await service.mutate(id, { type: "create_story", ...input, action: "luua konto ja kinnitada konto", size: "L" });
  await service.mutate(id, { type: "create_story", ...input, action: "broneerida" });
  await service.mutate(id, { type: "create_story", ...input, action: "broneerida" });
  const before = await service.get(id);
  const ai = conversationService(client, new FixtureAiProvider()); const workflow = proposalWorkflowService(client);
  const history = await ai.submit(id, { kind: "text", task: "review_backlog", text: "Vaata üle" });
  const message = history.messages.find(item => item.task === "review_backlog" && item.response)!;
  if (!message.response || !("findings" in message.response.payload)) throw new Error("Missing review");
  expect(message.response.payload.findings.map(item => item.category)).toEqual(expect.arrayContaining(["oversized", "duplicate"]));
  expect(await service.get(id)).toEqual(before);
  const finding = message.response.payload.findings.find(item => item.category === "duplicate")!;
  const row = message.findingProposals.find(item => item.temporaryId === finding.temporaryId)!;
  const command = { kind: "confirm_grooming", proposalId: row.proposalId, operation: finding.operation };
  await workflow.confirm(id, command); const applied = await service.get(id); await workflow.confirm(id, command);
  expect(await service.get(id)).toEqual(applied);
  const sibling = message.findingProposals.find(item => item.proposalId !== row.proposalId)!;
  expect((await client.proposal.findUniqueOrThrow({ where: { id: sibling.proposalId } })).status).toBe("pending");
  await workflow.confirm(id, { kind: "ignore_grooming", proposalId: sibling.proposalId }); expect(await service.get(id)).toEqual(applied);
  expect((await service.mutate(id, { type: "undo" })).stories).toEqual(before.stories);
 });
 it("finds malformed wording, missing wireframes and invalid criteria; repair stays scoped and can be undone", async () => {
  const { id, service } = await setup();
  const target = (await service.mutate(id, { type: "create_story", ...input, role: "", requiresMockup: true })).stories[0];
  await service.mutate(id, { type: "create_criterion", storyId: target.id, text: "Kiire", mockupElementIds: ["missing"] });
  const before = await service.get(id); const ai = conversationService(client, new FixtureAiProvider());
  const history = await ai.submit(id, { kind: "text", task: "review_backlog", text: "Vaata üle" });
  const message = history.messages.find(item => item.response && "findings" in item.response.payload)!;
  if (!message.response || !("findings" in message.response.payload)) throw new Error();
  expect(message.response.payload.findings.map(item => item.category)).toEqual(expect.arrayContaining(["malformed_connextra", "missing_mockup", "invalid_criteria"]));
  const finding = message.response.payload.findings[0]; const proposal = message.findingProposals[0];
  expect(await service.get(id)).toEqual(before);
  await proposalWorkflowService(client).confirm(id, { kind: "confirm_grooming", proposalId: proposal.proposalId, operation: finding.operation });
  const after = await service.get(id); expect(after.stories[0].role).toBe("Kasutaja"); expect(after.stories[0].criteria[0].check.status).toBe("pass");
  await expect(proposalWorkflowService(client).confirm(id, { kind: "confirm_grooming", proposalId: message.findingProposals[1].proposalId, operation: message.response.payload.findings[1].operation })).rejects.toMatchObject({ status: 409 });
  expect((await client.proposal.findUniqueOrThrow({ where: { id: message.findingProposals[1].proposalId } })).status).toBe("pending");
  const undone = await service.mutate(id, { type: "undo" }); expect(undone.stories[0].role).toBe(""); expect(undone.stories[0].criteria).toEqual(before.stories[0].criteria);
 });
 it("rejects invalid AI scope after one repair without creating findings", async () => {
  const { id, service } = await setup(); await service.mutate(id, { type: "create_story", ...input, size: "L" });
  const stories = (await backlogSnapshot(client, id)).stories;
  let calls = 0;
  await expect(generateValidated({ async generateStructured<T>(request: AiRequest) { calls++; const response = await new FixtureAiProvider().generateStructured<{ payload: { findings: Array<{ operation: { sources: Array<{ storyId: string }> } }> } } >({ ...request, context: { backlog: stories } }); response.payload.findings[0].operation.sources[0].storyId = "foreign"; return response as T; } }, "review_backlog", { backlog: stories })).rejects.toBeInstanceOf(AiInvalidOutputError);
  expect(calls).toBe(2);
  expect(await client.proposal.count({ where: { projectId: id } })).toBe(0);
  expect(replacementContent(stories, []).criteria).toEqual([]);
 });
});
