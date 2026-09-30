import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createDatabaseClient } from "@/lib/db/client";
import { projectService } from "@/services/projects/service";
import { storyService } from "@/services/stories/service";
import { conversationService } from "@/services/ai-orchestration/service";
import { proposalWorkflowService } from "@/services/proposals/workflow";
import { clarificationSchema, priorityRecommendationSchema, roleProposalSchema, storyProposalSchema, prototypePayloadSchema, type PrototypePayload } from "@/domain/ai/contracts";
import { AiInvalidOutputError, AiUnavailableError, FixtureAiProvider, OpenAiProvider, generateValidated, type AiProvider, type AiRequest } from "@/lib/ai/provider";

const fixture = new FixtureAiProvider();
async function valid(task: "clarify_idea" | "propose_roles" = "clarify_idea") { return fixture.generateStructured<unknown>({ task, systemInstructions: "", context: {}, outputSchema: {} }); }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("validated AI boundary", () => {
  it("rejects malformed, executable, unknown, duplicate and oversized response fields", async () => {
    const good = await valid() as Record<string, unknown>;
    expect(clarificationSchema.safeParse(good).success).toBe(true);
    for (const response of [
      { ...good, nextActions: [] }, { ...good, nextActions: [{ id: "exec", label: "Execute", action: "javascript:alert(1)" }] },
      { ...good, script: "alert(1)" }, { ...good, message: "a".repeat(1001) }, { ...good, payload: { questions: [] } },
      { ...good, payload: { questions: [{ id: "same", text: "Question", selectionMode: "single", options: [{ id: "x", label: "A" }, { id: "x", label: "B" }] }] } },
    ]) expect(clarificationSchema.safeParse(response).success).toBe(false);
    const role = await valid("propose_roles") as { payload: { roles: unknown[] } };
    expect(roleProposalSchema.safeParse({ ...role, payload: { roles: [role.payload.roles[0], role.payload.roles[0]] } }).success).toBe(false);
  });
  it("repairs once with safe validation errors and rejects partial output after two failures", async () => {
    const calls: AiRequest[] = [];
    const provider: AiProvider = { async generateStructured<T>(request: AiRequest) { calls.push(request); return (calls.length === 1 ? '{"message":"broken"}' : await valid()) as T; } };
    expect(await generateValidated(provider, "clarify_idea", {})).toMatchObject({ payload: { questions: expect.any(Array) } });
    expect(calls).toHaveLength(2);
    expect(calls[1].context).toMatchObject({ repair: { errors: expect.any(Array) } });
    const bad = vi.fn(async () => ({ message: "<script>unsafe</script>" }));
    await expect(generateValidated({ generateStructured: bad as AiProvider["generateStructured"] }, "clarify_idea", {})).rejects.toBeInstanceOf(AiInvalidOutputError);
    expect(bad).toHaveBeenCalledTimes(2);
  });
  it("repairs transport invalid-output errors but does not repair network failures", async () => {
    const broken = vi.fn(async () => { throw new AiInvalidOutputError(); });
    await expect(generateValidated({ generateStructured: broken }, "clarify_idea", {})).rejects.toBeInstanceOf(AiInvalidOutputError);
    expect(broken).toHaveBeenCalledTimes(2);
    const offline = vi.fn(async () => { throw new Error("private provider error"); });
    await expect(generateValidated({ generateStructured: offline }, "clarify_idea", {})).rejects.toThrow("private provider error");
    expect(offline).toHaveBeenCalledTimes(1);
  });
  it("live provider uses server-only authorization, strict structured output and safe errors", async () => {
    vi.stubEnv("OPENAI_API_KEY", "secret-test-key"); vi.stubEnv("OPENAI_MODEL", "configured-test-model");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(await valid()) }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await generateValidated(new OpenAiProvider(), "clarify_idea", { input: "Spordiklubi" });
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toBe("https://api.openai.com/v1/responses");
    expect(request[1].headers).toMatchObject({ Authorization: "Bearer secret-test-key" });
    const body = JSON.parse(request[1].body as string);
    expect(body).toMatchObject({ model: "configured-test-model", store: false, text: { format: { type: "json_schema", strict: true } } });
    expect(request[1].body).not.toContain("secret-test-key");
    fetcher.mockImplementationOnce(async () => new Response("secret-test-key provider trace", { status: 401 }));
    await expect(generateValidated(new OpenAiProvider(), "clarify_idea", {})).rejects.toBeInstanceOf(AiUnavailableError);
  });
  it("treats malformed successful provider envelopes as repairable invalid output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "secret-test-key"); vi.stubEnv("OPENAI_MODEL", "configured-test-model");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(await valid()) }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(generateValidated(new OpenAiProvider(), "clarify_idea", {})).resolves.toMatchObject({ payload: { questions: expect.any(Array) } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects already-answered questions after one repair", async () => {
    const generator = vi.fn(async () => await valid());
    await expect(generateValidated({ generateStructured: generator as AiProvider["generateStructured"] }, "clarify_idea", { answeredQuestionIds: ["goal"] })).rejects.toBeInstanceOf(AiInvalidOutputError);
    expect(generator).toHaveBeenCalledTimes(2);
  });
});

describe("persistent guided conversation", () => {
  let directory: string;
  let client: ReturnType<typeof createDatabaseClient>;
  let databaseUrl: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "ai-pm-conversation-"));
    const databasePath = join(directory, "test.db"); await writeFile(databasePath, ""); databaseUrl = `file:${databasePath}`;
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" }); client = createDatabaseClient(databaseUrl);
  }, 30_000);
  afterAll(async () => { await client?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });
  it("one vague sentence asks a question; choices produce only pending roles and survive reconnect", async () => {
    const project = await projectService(client).create({ name: "Spordiklubi", description: "Treeningud" });
    const service = conversationService(client, fixture);
    let result = await service.submit(project.id, { kind: "text", text: "Soovin spordiklubi rakendust." });
    const question = result.messages.find(m => m.response)!;
    result = await service.submit(project.id, { kind: "answer", messageId: question.id, questionId: "goal", optionIds: ["booking"], skip: false });
    expect(result.messages.map(m => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(result.messages[2].content).toContain("Treeningute broneerimine");
    expect(result.messages[3].response?.payload).toHaveProperty("roles");
    expect(await client.projectRole.count({ where: { projectId: project.id } })).toBe(0);
    expect(await client.story.count({ where: { projectId: project.id } })).toBe(0);
    expect(await client.changeEvent.count({ where: { projectId: project.id } })).toBe(0);
    expect(await client.proposal.findMany({ where: { projectId: project.id } })).toMatchObject([{ type: "roles", status: "pending" }]);
    await client.$disconnect(); client = createDatabaseClient(databaseUrl);
    expect((await conversationService(client).get(project.id)).messages).toEqual(result.messages);
  });
  it("Other and Skip persist, regenerate supersedes only pending sibling roles", async () => {
    for (const answer of [{ optionIds: [], other: "Treenerite graafikud", skip: false }, { optionIds: [], skip: true }]) {
      const project = await projectService(client).create({ name: "Valikud" }); const service = conversationService(client, fixture);
      const result = await service.submit(project.id, { kind: "text", text: "Idee" }); const source = result.messages.find(m => m.response)!;
      const answered = await service.submit(project.id, { kind: "answer", messageId: source.id, questionId: "goal", ...answer });
      expect(answered.messages[2].content).toContain(answer.skip ? "Jäta vahele" : "Muu: Treenerite graafikud");
      await service.submit(project.id, { kind: "text", task: "propose_roles", text: "Täpsusta rolle" });
      expect((await client.proposal.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } })).map(p => p.status)).toEqual(["superseded", "pending"]);
    }
  });
  it("free text after roles is interpreted in task-relevant current context", async () => {
    const project = await projectService(client).create({ name: "Kontekst" });
    const requests: AiRequest[] = [];
    const recorder: AiProvider = { async generateStructured<T>(request: AiRequest) { requests.push(request); return fixture.generateStructured<T>(request); } };
    const service = conversationService(client, recorder);
    await service.submit(project.id, { kind: "text", task: "propose_roles", text: "Paku rolle" });
    await client.project.update({ where: { id: project.id }, data: { description: "Värske kirjeldus" } });
    await service.submit(project.id, { kind: "text", text: "Peamine kasutaja on treener" });
    expect(requests[1]).toMatchObject({ task: "propose_roles", context: { project: { description: "Värske kirjeldus" }, input: "Peamine kasutaja on treener", boundaries: { mutableEntities: [] } } });
  });
  it("invalid output stores no valid proposal or assistant content; retry preserves message and manual work", async () => {
    const project = await projectService(client).create({ name: "Tõrked" });
    vi.stubEnv("OPENAI_API_KEY", "do-not-expose-me");
    const bad: AiProvider = { async generateStructured<T>() { return { message: "do-not-expose-me", payload: { roles: [] }, nextActions: [] } as T; } };
    const failed = await conversationService(client, bad).submit(project.id, { kind: "text", task: "propose_roles", text: "Idee säilib" });
    expect(failed.messages.filter(m => m.role === "assistant")).toHaveLength(0);
    expect(JSON.stringify(failed)).not.toContain("do-not-expose-me");
    expect(await client.proposal.count({ where: { projectId: project.id } })).toBe(0);
    expect(failed.messages[0]).toMatchObject({ content: "Idee säilib", requestStatus: "failed" });
    await storyService(client).mutate(project.id, { type: "create_story", role: "Liige", action: "broneerida", benefit: "saan treenida", requiresMockup: false, status: "idea", size: null });
    const retry = await conversationService(client, fixture).submit(project.id, { kind: "retry", messageId: failed.messages[0].id });
    expect(retry.messages.filter(m => m.role === "user")).toHaveLength(1);
    expect(retry.messages[0].requestStatus).toBe("complete");
    await conversationService(client, fixture).submit(project.id, { kind: "retry", messageId: failed.messages[0].id });
    expect(await client.proposal.count({ where: { projectId: project.id } })).toBe(1);
    expect(await client.story.count({ where: { projectId: project.id } })).toBe(1);
  });
  it("rejects cross-project messages, fabricated options, stale and duplicate answers before writing", async () => {
    const p = await projectService(client).create({ name: "Scope" }); const other = await projectService(client).create({ name: "Teine" });
    const service = conversationService(client, fixture); const result = await service.submit(p.id, { kind: "text", text: "Idee" }); const source = result.messages[1];
    const answer = { kind: "answer", messageId: source.id, questionId: "goal", optionIds: ["booking"], skip: false };
    await expect(service.submit(other.id, answer)).rejects.toMatchObject({ status: 409 });
    await expect(service.submit(other.id, { kind: "retry", messageId: result.messages[0].id })).rejects.toMatchObject({ status: 404 });
    await expect(service.submit(p.id, { ...answer, optionIds: ["fake"] })).rejects.toMatchObject({ status: 400 });
    expect((await service.get(p.id)).messages).toHaveLength(2);
    await service.submit(p.id, answer);
    await expect(service.submit(p.id, answer)).rejects.toMatchObject({ status: 409 });
    await expect(service.get("missing-project")).rejects.toMatchObject({ status: 404 });
  });
  it("safe provider exceptions preserve no sensitive diagnostics", async () => {
    const p = await projectService(client).create({ name: "Saladus" });
    const service = conversationService(client, { async generateStructured() { throw new Error("key-secret internal stack full prompt"); } });
    const result = await service.submit(p.id, { kind: "text", text: "Avalik idee" });
    expect(result.messages.at(-1)).toMatchObject({ messageType: "ai_error" });
    expect(JSON.stringify(result)).not.toMatch(/key-secret|internal stack|full prompt/);
    expect(JSON.stringify(await client.conversationMessage.findMany({ where: { projectId: p.id } }))).not.toMatch(/key-secret|internal stack|full prompt/);
  });
});

describe("role, story and priority proposal workflow", () => {
  let directory: string;
  let client: ReturnType<typeof createDatabaseClient>;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "ai-pm-story-proposals-"));
    const databasePath = join(directory, "test.db"); await writeFile(databasePath, "");
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: `file:${databasePath}` }, stdio: "pipe" });
    client = createDatabaseClient(`file:${databasePath}`);
  }, 30_000);
  afterAll(async () => { await client?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });

  async function prototypeSetup() {
    const project = await projectService(client).create({ name: "Prototüüp" });
    const stories = storyService(client);
    await stories.mutate(project.id, { type: "create_story", role: "Liige", action: "broneerida treeningu", benefit: "saan treenida", requiresMockup: true, status: "idea", size: null });
    await stories.mutate(project.id, { type: "create_story", role: "Haldur", action: "vaadata aruannet", benefit: "näen tulemust", requiresMockup: true, status: "idea", size: null });
    const before = await stories.get(project.id);
    const target = before.stories[0];
    await stories.mutate(project.id, { type: "select", storyId: target.id });
    const requests: AiRequest[] = [];
    const recorder: AiProvider = { async generateStructured<T>(request: AiRequest) { requests.push(request); return fixture.generateStructured<T>(request); } };
    const data = await conversationService(client, recorder).submit(project.id, { kind: "text", task: "propose_prototype", text: "Koosta prototüüp" });
    const message = data.messages.find(item => item.task === "propose_prototype" && item.response)!;
    expect(message).toBeDefined();
    const payload = message.response && "targetStoryId" in message.response.payload ? message.response.payload : null;
    expect(payload).not.toBeNull();
    return { project, stories, target, sibling: before.stories[1], message, payload: payload as PrototypePayload, requests };
  }

  it("previews only; applies accepted and edited criteria atomically, isolates siblings and undoes the complete prototype", async () => {
    const { project, stories, target, sibling, message, payload, requests } = await prototypeSetup();
    expect(requests[0]).toMatchObject({ task: "propose_prototype", context: { selectedStoryId: target.id, selectedStory: { id: target.id, version: target.version, criteria: [], openQuestions: [], mockup: null }, boundaries: { targetStoryId: target.id, baseStoryVersion: target.version, mode: "proposal_only" } } });
    expect((await stories.get(project.id)).stories[0]).toEqual(target);
    const eventsBefore = await client.changeEvent.count({ where: { projectId: project.id } });
    const criteria = payload.criteria.slice(0, 3).map((item, index) => index === 1 ? { ...item, text: "Kinnitamise nupp salvestab ühe broneeringu." } : item);
    const command = { kind: "confirm_prototype", proposalId: message.proposalId, acceptProposedStory: true, criteria };
    await proposalWorkflowService(client).confirm(project.id, command);
    await proposalWorkflowService(client).confirm(project.id, command);
    const applied = await stories.get(project.id);
    expect(applied.stories[1]).toEqual(sibling);
    expect(applied.stories[0].version).toBe(target.version + 1);
    expect(applied.stories[0].criteria.map(item => item.text)).toEqual(criteria.map(item => item.text));
    expect(applied.stories[0].criteria.every(item => item.origin === "ai" && item.check.status === "pass")).toBe(true);
    expect(applied.stories[0].mockupVersions).toMatchObject([{ version: 1, source: "ai", structureJson: JSON.stringify(payload.mockup) }]);
    expect(applied.stories[0].readiness.ready).toBe(true);
    expect(await client.changeEvent.count({ where: { projectId: project.id } })).toBe(eventsBefore + 1);
    expect(applied.recommendedNextStage).toBe("refinements");
    await stories.mutate(project.id, { type: "undo" });
    const undone = await stories.get(project.id);
    expect(undone.stories[0].criteria).toEqual(target.criteria);
    expect(undone.stories[0].version).toBe(target.version);
    expect(undone.stories[0].mockupVersions.map(item => item.version)).toEqual([2, 1]);
    expect(JSON.parse(undone.stories[0].mockupVersions[0].structureJson).elements).toEqual([]);
    expect(undone.stories[1]).toEqual(sibling);
    expect(undone.recommendedNextStage).toBe("idea");
  });

  it("rejects stale versions, cross-project/target commands and invalid edited mappings without partial writes", async () => {
    const { project, stories, target, message, payload } = await prototypeSetup();
    const workflow = proposalWorkflowService(client);
    const command = { kind: "confirm_prototype", proposalId: message.proposalId, acceptProposedStory: false, criteria: payload.criteria.slice(0, 3) };
    const foreign = await projectService(client).create({ name: "Võõras" });
    await expect(workflow.confirm(foreign.id, command)).rejects.toMatchObject({ status: 404 });
    await expect(workflow.confirm(project.id, { ...command, targetStoryId: "foreign" })).rejects.toThrow();
    await expect(workflow.confirm(project.id, { ...command, criteria: [{ ...payload.criteria[0], mockupElementIds: ["nonexistent"] }] })).rejects.toMatchObject({ status: 422 });
    await expect(workflow.confirm(project.id, { ...command, criteria: [{ ...payload.criteria[0], temporaryId: "fabricated" }] })).rejects.toMatchObject({ status: 422 });
    expect((await stories.get(project.id)).stories[0]).toEqual(target);
    await stories.mutate(project.id, { type: "create_question", storyId: target.id, text: "Kas broneering vajab kinnitust?" });
    const before = await stories.get(project.id);
    await expect(workflow.confirm(project.id, command)).rejects.toMatchObject({ status: 409 });
    expect(await stories.get(project.id)).toEqual(before);
    expect(await client.proposal.findUniqueOrThrow({ where: { id: message.proposalId! } })).toMatchObject({ status: "pending" });
  });

  it("validates safe prototype trees and scope with one repair, discards without mutation", async () => {
    const { project, stories, target, message, payload } = await prototypeSetup();
    expect(prototypePayloadSchema.safeParse({ ...payload, criteria: [payload.criteria[0], payload.criteria[0], payload.criteria[2]] }).success).toBe(false);
    expect(prototypePayloadSchema.safeParse({ ...payload, mockup: { ...payload.mockup, elements: [{ id: "x", type: "script", text: "alert(1)" }] } }).success).toBe(false);
    const wrongScope: AiProvider = { async generateStructured<T>() { return { message: "Ettepanek", payload: { ...payload, targetStoryId: "another-story" }, nextActions: [{ id: "again", label: "Uuesti", action: "propose_prototype" }] } as T; } };
    await expect(generateValidated(wrongScope, "propose_prototype", { selectedStory: { id: target.id, version: target.version } })).rejects.toBeInstanceOf(AiInvalidOutputError);
    const before = await stories.get(project.id);
    await proposalWorkflowService(client).confirm(project.id, { kind: "reject_prototype", proposalId: message.proposalId });
    expect(await stories.get(project.id)).toEqual(before);
    await expect(proposalWorkflowService(client).confirm(project.id, { kind: "confirm_prototype", proposalId: message.proposalId, acceptProposedStory: false, criteria: payload.criteria.slice(0, 3) })).rejects.toMatchObject({ status: 409 });
  });

  it("regenerates from current criteria/mockup and preserves history while recalculating readiness", async () => {
    const { project, stories, target, message, payload } = await prototypeSetup();
    const workflow = proposalWorkflowService(client);
    await workflow.confirm(project.id, { kind: "confirm_prototype", proposalId: message.proposalId, acceptProposedStory: false, criteria: payload.criteria.slice(0, 3) });
    const readyStory = (await stories.get(project.id)).stories[0];
    await stories.mutate(project.id, { type: "update_story", storyId: target.id, role: readyStory.role, action: readyStory.action, benefit: readyStory.benefit, status: "ready_for_development", size: null, requiresMockup: true });
    const requests: AiRequest[] = [];
    const provider: AiProvider = { async generateStructured<T>(request: AiRequest) {
      requests.push(request);
      const response = await fixture.generateStructured<{ payload: PrototypePayload }>(request);
      response.payload.proposedStory = { role: "Klubi liige", action: "kinnitada treeningu broneeringu", benefit: "koht säilib" };
      return response as T;
    } };
    const data = await conversationService(client, provider).submit(project.id, { kind: "text", task: "propose_prototype", text: "Täpsusta prototüüpi" });
    const next = data.messages.filter(item => item.task === "propose_prototype" && item.response).at(-1)!;
    const proposal = next.response && "targetStoryId" in next.response.payload && !("crossStorySuggestions" in next.response.payload) ? next.response.payload : payload;
    expect(requests[0]).toMatchObject({ context: { selectedStory: { criteria: expect.arrayContaining([{ text: payload.criteria[0].text, mockupElementIds: payload.criteria[0].mockupElementIds }]), mockup: payload.mockup } } });
    const before = await stories.get(project.id);
    const oldMockup = before.stories[0].mockupVersions[0];
    await workflow.confirm(project.id, { kind: "confirm_prototype", proposalId: next.proposalId, acceptProposedStory: true, criteria: [proposal.criteria[3]] });
    const changed = (await stories.get(project.id)).stories[0];
    expect(changed).toMatchObject({ role: "Klubi liige", action: "kinnitada treeningu broneeringu", benefit: "koht säilib", status: "needs_clarification", version: before.stories[0].version + 1 });
    expect(changed.readiness.ready).toBe(false);
    expect(changed.mockupVersions[1]).toEqual(oldMockup);
    expect(changed.mockupVersions[0]).toMatchObject({ version: 2, source: "ai" });
  });

  async function refinementSetup() {
    const setup = await prototypeSetup();
    await proposalWorkflowService(client).confirm(setup.project.id, { kind: "confirm_prototype", proposalId: setup.message.proposalId, acceptProposedStory: false, criteria: setup.payload.criteria.slice(0, 3) });
    const before = await setup.stories.get(setup.project.id);
    const requests: AiRequest[] = [];
    const recorder: AiProvider = { async generateStructured<T>(request: AiRequest) { requests.push(request); return fixture.generateStructured<T>(request); } };
    const data = await conversationService(client, recorder).submit(setup.project.id, { kind: "text", text: "Kliendi täpsustus: hind peab sisaldama käibemaksu 24%." });
    const message = data.messages.filter(item => item.task === "propose_refinement" && item.response).at(-1)!;
    expect(message).toBeDefined();
    const payload = message.response && "crossStorySuggestions" in message.response.payload ? message.response.payload : null;
    if (!payload) throw new Error("Missing refinement");
    return { ...setup, before, message, payload, requests };
  }

  it("refinement previews are isolated; edited apply is atomic, idempotent and completely undoable", async () => {
    const { project, stories, target, before, message, payload, requests } = await refinementSetup();
    expect(await stories.get(project.id)).toEqual(before);
    expect(requests[0]).toMatchObject({ task: "propose_refinement", context: { selectedStory: { id: target.id, version: before.stories[0].version, mockup: payload.mockup!.before }, boundaries: { mutableFields: ["role", "action", "benefit", "criteria", "mockup"] } } });
    const suggestions = await client.proposal.findMany({ where: { projectId: project.id, type: "cross_story_suggestion" } });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ status: "pending", targetStoryId: before.stories[1].id });
    const events = await client.changeEvent.count({ where: { projectId: project.id } });
    const command = { kind: "confirm_refinement", proposalId: message.proposalId, edits: { story: { ...payload.story!.after, benefit: "näen lõplikku hinda" }, criteria: payload.criteria!.after } };
    await proposalWorkflowService(client).confirm(project.id, command);
    await proposalWorkflowService(client).confirm(project.id, command);
    const applied = await stories.get(project.id);
    expect(applied.stories[1]).toEqual(before.stories[1]);
    expect(applied.stories[0]).toMatchObject({ benefit: "näen lõplikku hinda", version: before.stories[0].version + 1 });
    expect(applied.stories[0].criteria).toHaveLength(4);
    expect(applied.stories[0].mockupVersions[0]).toMatchObject({ source: "refinement", version: 2 });
    expect(applied.stories[0].mockupVersions[1]).toEqual(before.stories[0].mockupVersions[0]);
    expect(await client.changeEvent.count({ where: { projectId: project.id } })).toBe(events + 1);
    expect(await client.proposal.findUnique({ where: { id: suggestions[0].id } })).toEqual(suggestions[0]);
    await stories.mutate(project.id, { type: "undo" });
    const undone = await stories.get(project.id);
    expect(undone.stories[1]).toEqual(before.stories[1]);
    expect(undone.stories[0].criteria).toEqual(before.stories[0].criteria);
    expect(undone.stories[0]).toMatchObject({ role: before.stories[0].role, action: before.stories[0].action, benefit: before.stories[0].benefit, version: before.stories[0].version });
    expect(undone.stories[0].mockupVersions[0].structureJson).toBe(before.stories[0].mockupVersions[0].structureJson);
    expect(undone.stories[0].mockupVersions).toHaveLength(3);
  });

  it("refinement rejects stale, cross-story fields, bad mappings, tampered before values and foreign projects", async () => {
    const { project, stories, before, message, payload } = await refinementSetup();
    const workflow = proposalWorkflowService(client);
    const command = { kind: "confirm_refinement", proposalId: message.proposalId, edits: {} };
    await expect(workflow.confirm(project.id, { ...command, targetStoryId: before.stories[1].id })).rejects.toThrow();
    await expect(workflow.confirm(project.id, { ...command, edits: { story: { ...payload.story!.after, position: 99 } } })).rejects.toThrow();
    await expect(workflow.confirm(project.id, { ...command, edits: { criteria: [{ text: "Ekraan kuvab hinna.", mockupElementIds: ["foreign-element"] }] } })).rejects.toMatchObject({ status: 422 });
    const other = await projectService(client).create({ name: "Foreign" });
    await expect(workflow.confirm(other.id, command)).rejects.toMatchObject({ status: 404 });
    await client.proposal.update({ where: { id: message.proposalId! }, data: { afterSnapshotJson: JSON.stringify({ ...payload, story: { ...payload.story, before: { ...payload.story!.before, role: "Tampered" } } }) } });
    await expect(workflow.confirm(project.id, command)).rejects.toMatchObject({ status: 422 });
    expect(await stories.get(project.id)).toEqual(before);
    await client.proposal.update({ where: { id: message.proposalId! }, data: { afterSnapshotJson: JSON.stringify(payload) } });
    await stories.mutate(project.id, { type: "create_question", storyId: before.stories[0].id, text: "Kas hind võib muutuda?" });
    const stale = await stories.get(project.id);
    await expect(workflow.confirm(project.id, command)).rejects.toMatchObject({ status: 409 });
    expect(await stories.get(project.id)).toEqual(stale);
    await workflow.confirm(project.id, { kind: "reject_refinement", proposalId: message.proposalId });
    expect(await stories.get(project.id)).toEqual(stale);
  });

  it("invalid AI refinement before-values, scope and executable trees are repaired once, never displayed", async () => {
    const { project, before, requests, payload } = await refinementSetup();
    for (const changed of [
      { ...payload, targetStoryId: before.stories[1].id },
      { ...payload, criteria: { ...payload.criteria, before: [] } },
      { ...payload, mockup: { ...payload.mockup, after: { schemaVersion: 1, screenName: "Unsafe", elements: [{ id: "script", type: "script" }] } } },
      { ...payload, crossStorySuggestions: [{ targetStoryId: "foreign", suggestion: "Change another project" }] },
      { ...payload, story: { ...payload.story, after: { ...payload.story!.after, status: "ready_for_development" } } },
    ]) {
      const spy = vi.fn(async () => ({ message: "Täpsustus", payload: changed, nextActions: [{ id: "retry", label: "Uuesti", action: "propose_refinement" }] }));
      await expect(generateValidated({ generateStructured: spy as AiProvider["generateStructured"] }, "propose_refinement", requests[0].context)).rejects.toBeInstanceOf(AiInvalidOutputError);
      expect(spy).toHaveBeenCalledTimes(2);
    }
    const bad = conversationService(client, { async generateStructured<T>() { return { message: "Broken" } as T; } });
    const count = await client.proposal.count({ where: { projectId: project.id } });
    const data = await bad.submit(project.id, { kind: "text", task: "propose_refinement", text: "Bad output" });
    expect(data.messages.at(-1)?.messageType).toBe("ai_error");
    expect(await client.proposal.count({ where: { projectId: project.id } })).toBe(count);
  });

  it("validates bounded happy-path and scoped priority response contracts", async () => {
    const stories = await fixture.generateStructured<unknown>({ task: "propose_stories", systemInstructions: "", context: { roles: [{ name: "Liige", isPrimary: true }] }, outputSchema: {} });
    expect(storyProposalSchema.safeParse(stories).success).toBe(true);
    expect(storyProposalSchema.safeParse({ ...(stories as object), payload: { primaryRole: "Liige", stories: [] } }).success).toBe(false);
    const priority = { message: "Valik", payload: { storyId: "known", rationale: "Annab põhiväärtuse." }, nextActions: [{ id: "again", label: "Uuesti", action: "recommend_priority" }] };
    expect(priorityRecommendationSchema.safeParse(priority).success).toBe(true);
    expect(priorityRecommendationSchema.safeParse({ ...priority, payload: { storyId: "", rationale: "x" } }).success).toBe(false);
  });

  it("applies edited roles and only selected stories once, then reorders only on confirmed priority", async () => {
    const project = await projectService(client).create({ name: "Spordiklubi", description: "Treeningute leidmine ja broneerimine" });
    const conversation = conversationService(client, fixture); const workflow = proposalWorkflowService(client);
    let data = await conversation.submit(project.id, { kind: "text", task: "propose_roles", text: "Paku rollid" });
    const roleMessage = data.messages.find(message => message.task === "propose_roles" && message.response)!;
    expect(await client.projectRole.count({ where: { projectId: project.id } })).toBe(0);
    expect(await client.changeEvent.count({ where: { projectId: project.id } })).toBe(0);
    const offeredRoles = roleMessage.response && "roles" in roleMessage.response.payload ? roleMessage.response.payload.roles : [];
    await workflow.confirm(project.id, { kind: "confirm_roles", proposalId: roleMessage.proposalId, roles: offeredRoles.slice(0, 2).map((role, index) => ({ temporaryId: role.temporaryId, name: index ? role.name : "Klubi liige" })), primaryTemporaryId: offeredRoles[0].temporaryId });
    expect(await client.projectRole.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } })).toMatchObject([{ name: "Klubi liige", isPrimary: true, origin: "ai" }, { isPrimary: false }]);
    expect(await client.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ currentStage: "stories", recommendedNextStage: "stories" });

    data = await conversation.submit(project.id, { kind: "text", task: "propose_stories", text: "Koosta happy path" });
    const storyMessage = data.messages.find(message => message.task === "propose_stories" && message.response)!;
    const offeredStories = storyMessage.response && "stories" in storyMessage.response.payload ? storyMessage.response.payload.stories : [];
    expect(offeredStories.length).toBeGreaterThanOrEqual(5);
    expect(await client.story.count({ where: { projectId: project.id } })).toBe(0);
    const selected = offeredStories.slice(0, -1).map(story => story.temporaryId);
    await workflow.confirm(project.id, { kind: "confirm_stories", proposalId: storyMessage.proposalId, selectedTemporaryIds: selected });
    await workflow.confirm(project.id, { kind: "confirm_stories", proposalId: storyMessage.proposalId, selectedTemporaryIds: selected });
    const saved = await client.story.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } });
    expect(saved).toHaveLength(offeredStories.length - 1);
    expect(saved.map(story => story.position)).toEqual(saved.map((_, index) => index));
    expect(saved.map(story => story.action)).not.toContain(offeredStories.at(-1)?.action);
    expect(await client.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ currentStage: "priorities", recommendedNextStage: "priorities" });

    const orderBefore = saved.map(story => story.id);
    data = await conversation.submit(project.id, { kind: "text", task: "recommend_priority", text: "Soovita prioriteet" });
    const priorityMessage = data.messages.find(message => message.task === "recommend_priority" && message.response)!;
    expect((await client.story.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } })).map(story => story.id)).toEqual(orderBefore);
    const chosen = saved.at(-1)!;
    await workflow.confirm(project.id, { kind: "confirm_priority", proposalId: priorityMessage.proposalId, storyId: chosen.id });
    expect((await client.story.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } }))[0].id).toBe(chosen.id);
    expect(await client.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ selectedStoryId: chosen.id, currentStage: "prototype", recommendedNextStage: "prototype" });
    await storyService(client).mutate(project.id, { type: "undo" });
    expect((await client.story.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } })).map(story => story.id)).toEqual(orderBefore);
    expect(await client.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ selectedStoryId: null, currentStage: "priorities", recommendedNextStage: "priorities" });
  });

  it("undo restores roles and stage from one confirmed operation", async () => {
    const project = await projectService(client).create({ name: "Rollide undo" }); const conversation = conversationService(client, fixture); const workflow = proposalWorkflowService(client);
    const data = await conversation.submit(project.id, { kind: "text", task: "propose_roles", text: "Paku rollid" });
    const message = data.messages.find(item => item.task === "propose_roles" && item.response)!;
    const roles = message.response && "roles" in message.response.payload ? message.response.payload.roles : [];
    await workflow.confirm(project.id, { kind: "confirm_roles", proposalId: message.proposalId, roles: roles.map(role => ({ temporaryId: role.temporaryId, name: role.name })), primaryTemporaryId: roles[0].temporaryId });
    await storyService(client).mutate(project.id, { type: "undo" });
    expect(await client.projectRole.count({ where: { projectId: project.id } })).toBe(0);
    expect(await client.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ currentStage: "idea", recommendedNextStage: "idea" });
  });

  it("rejects cross-project and superseded confirmations", async () => {
    const first = await projectService(client).create({ name: "Esimene" }); const second = await projectService(client).create({ name: "Teine" });
    const conversation = conversationService(client, fixture); const workflow = proposalWorkflowService(client);
    const initial = await conversation.submit(first.id, { kind: "text", task: "propose_roles", text: "Rollid" });
    const message = initial.messages.find(item => item.task === "propose_roles" && item.response)!;
    const roles = message.response && "roles" in message.response.payload ? message.response.payload.roles : [];
    await expect(workflow.confirm(second.id, { kind: "confirm_roles", proposalId: message.proposalId, roles: roles.map(role => ({ temporaryId: role.temporaryId, name: role.name })), primaryTemporaryId: roles[0].temporaryId })).rejects.toMatchObject({ status: 404 });
    await conversation.submit(first.id, { kind: "text", task: "propose_roles", text: "Uued rollid" });
    await expect(workflow.confirm(first.id, { kind: "confirm_roles", proposalId: message.proposalId, roles: roles.map(role => ({ temporaryId: role.temporaryId, name: role.name })), primaryTemporaryId: roles[0].temporaryId })).rejects.toMatchObject({ status: 409 });
  });
});
