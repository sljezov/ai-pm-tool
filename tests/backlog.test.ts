import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createDatabaseClient } from "@/lib/db/client";
import { storyService } from "@/services/stories/service";
import { checkCriterion } from "@/domain/criteria/validation";
import { calculateReadiness } from "@/domain/readiness/readiness";
const input = { role: "Liige", action: "broneerida treeningu", benefit: "koht oleks tagatud", status: "idea", size: null, requiresMockup: false };
describe("manual backlog invariants", () => {
 let directory: string; let client: ReturnType<typeof createDatabaseClient>;
 beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), "ai-pm-backlog-")); const url = `file:${join(directory, "test.db")}`;
  execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" }); client = createDatabaseClient(url);
 }, 30_000);
 afterAll(async () => { await client?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });
 const setup = async () => { const project = await client.project.create({ data: { name: "Backlog", description: "" } }); return { id: project.id, service: storyService(client) }; };
 it("validates deterministic criteria without rejecting every ja", () => {
  expect(checkCriterion("").status).toBe("fail"); expect(checkCriterion("Teenuse kasutamine on kiire ja mugav.").status).toBe("warning");
  expect(checkCriterion("Teenus salvestab ees- ja perekonnanime.").status).toBe("pass");
  expect(checkCriterion("Teenus salvestab taotluse; saadab kinnituse.").status).toBe("warning");
  expect(checkCriterion("Nupp kuvab kinnituse.").status).toBe("warning");
  expect(checkCriterion("Nupp kuvab kinnituse.", ["missing"], ["valid"]).status).toBe("fail");
 });
 it("reports all readiness failures and distrusts cached validation", async () => {
  const { id, service } = await setup(); let data = await service.mutate(id, { type: "create_story", ...input, role: "", requiresMockup: true }); const story = data.stories[0];
  await service.mutate(id, { type: "create_question", storyId: story.id, text: "Kas maks on lisatud?" });
  await expect(service.mutate(id, { type: "update_story", storyId: story.id, ...input, role: "", requiresMockup: true, status: "ready_for_development" })).rejects.toMatchObject({ status: 422, issues: expect.arrayContaining([expect.objectContaining({ code: "connextra" }), expect.objectContaining({ code: "criterion_count" }), expect.objectContaining({ code: "mockup_required" }), expect.objectContaining({ code: "open_questions" })]) });
  data = await service.get(id); expect(data.stories[0].status).toBe("idea");
  const criterion = await client.acceptanceCriterion.create({ data: { storyId: story.id, text: "Kiire ja mugav teenus", position: 0, validationStatus: "pass" } });
  expect((await service.get(id)).stories[0].criteria[0].check.status).toBe("warning"); expect(criterion.validationStatus).toBe("pass");
 });
 it("allows nonvisual ready stories, invalidates on new questions and restores complete snapshot once", async () => {
  const { id, service } = await setup(); let data = await service.mutate(id, { type: "create_story", ...input }); const storyId = data.stories[0].id;
  for (const text of ["Teenus salvestab broneeringu.", "Teenus saadab kinnituse e-postiga.", "Teenus keeldub täis treeningu broneerimisest."]) await service.mutate(id, { type: "create_criterion", storyId, text });
  data = await service.mutate(id, { type: "update_story", storyId, ...input, status: "ready_for_development" }); expect(data.stories[0].readiness.ready).toBe(true); const previous = data.stories[0];
  data = await service.mutate(id, { type: "create_question", storyId, text: "Kas hind sisaldab maksu?" }); expect(data.stories[0].status).toBe("needs_clarification"); expect(data.stories[0].version).toBe(previous.version + 1);
  data = await service.mutate(id, { type: "undo" }); expect(data.stories[0]).toEqual(previous); expect(data.canUndo).toBe(false);
  await expect(service.mutate(id, { type: "undo" })).rejects.toMatchObject({ status: 409 });
 });
 it("maintains contiguous order and anchors MVP to the story through reorder, archive and undo", async () => {
  const { id, service } = await setup(); let data;
  for (let n = 0; n < 3; n++) data = await service.mutate(id, { type: "create_story", ...input, action: `tegevus ${n}` });
  const ids = data!.stories.map(story => story.id); await service.mutate(id, { type: "boundary", storyId: ids[1] });
  data = await service.mutate(id, { type: "reorder", storyIds: [ids[1], ids[2], ids[0]] }); expect(data.mvpBoundaryAfterStoryId).toBe(ids[1]); expect(data.stories.map(item => item.position)).toEqual([0, 1, 2]);
  await service.mutate(id, { type: "select", storyId: ids[1] });
  data = await service.mutate(id, { type: "archive_story", storyId: ids[1] }); expect(data.mvpBoundaryAfterStoryId).toBeNull(); expect(data.selectedStoryId).toBeNull(); expect(data.stories.map(item => item.position)).toEqual([0, 1]);
  data = await service.mutate(id, { type: "undo" }); expect(data.mvpBoundaryAfterStoryId).toBe(ids[1]); expect(data.selectedStoryId).toBe(ids[1]); expect(data.stories.map(item => item.id)).toEqual([ids[1], ids[2], ids[0]]);
 });
 it("scopes story and child resources and rejects malformed permutations atomically", async () => {
  const { id, service } = await setup(); const other = await setup(); const a = (await service.mutate(id, { type: "create_story", ...input })).stories[0]; const b = (await service.mutate(other.id, { type: "create_story", ...input })).stories[0];
  for (const type of ["select", "boundary", "archive_story"]) await expect(service.mutate(id, { type, storyId: b.id })).rejects.toMatchObject({ status: 404 });
  const child = (await service.mutate(other.id, { type: "create_criterion", storyId: b.id, text: "Teenus salvestab taotluse." })).stories[0].criteria[0];
  await expect(service.mutate(id, { type: "delete_criterion", storyId: a.id, criterionId: child.id })).rejects.toMatchObject({ status: 404 });
  await expect(service.mutate(id, { type: "reorder", storyIds: [a.id, a.id] })).rejects.toMatchObject({ status: 400 }); expect((await service.get(id)).stories[0].position).toBe(0);
 });
 it("criterion and question editing/deletion can be undone; creation undo archives audit record", async () => {
  const { id, service } = await setup(); let data = await service.mutate(id, { type: "create_story", ...input }); const storyId = data.stories[0].id;
  data = await service.mutate(id, { type: "create_criterion", storyId, text: "Teenus salvestab taotluse." }); const criterion = data.stories[0].criteria[0];
  data = await service.mutate(id, { type: "update_criterion", storyId, criterionId: criterion.id, text: "Mugav teenus on kiire." }); expect(data.stories[0].criteria[0].check.status).toBe("warning");
  data = await service.mutate(id, { type: "undo" }); expect(data.stories[0].criteria[0]).toEqual(criterion);
  await service.mutate(id, { type: "delete_criterion", storyId, criterionId: criterion.id }); data = await service.mutate(id, { type: "undo" }); expect(data.stories[0].criteria[0]).toEqual(criterion);
  data = await service.mutate(id, { type: "create_question", storyId, text: "Kas vajalik?" }); const questionId = data.stories[0].openQuestions[0].id;
  data = await service.mutate(id, { type: "update_question", storyId, questionId, text: "Kas on vajalik?", resolved: true }); expect(data.stories[0].openQuestions[0].resolvedAt).not.toBeNull();
  await service.mutate(id, { type: "delete_question", storyId, questionId }); data = await service.mutate(id, { type: "undo" }); expect(data.stories[0].openQuestions[0].resolvedAt).not.toBeNull();
  data = await service.mutate(id, { type: "create_story", ...input }); const created = data.stories[1].id; data = await service.mutate(id, { type: "undo" }); expect(data.stories).toHaveLength(1); expect((await client.story.findUniqueOrThrow({ where: { id: created } })).archivedAt).not.toBeNull();
 });
 it("fresh mockup references and malformed references block readiness", () => {
  const base = { ...input, criteria: Array.from({ length: 3 }, () => ({ text: "Teenus salvestab taotluse.", mockupElementIdsJson: '["removed"]' })), openQuestions: [], mockupVersions: [{ structureJson: '{"elements":[{"id":"current"}]}' }] };
  expect(calculateReadiness(base).ready).toBe(false);
  expect(calculateReadiness({ ...base, criteria: base.criteria.map(c => ({ ...c, mockupElementIdsJson: 'null' })) }).ready).toBe(false);
 });
});
