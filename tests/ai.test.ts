import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createDatabaseClient } from "@/lib/db/client";
import { projectService } from "@/services/projects/service";
import { storyService } from "@/services/stories/service";
import { conversationService } from "@/services/ai-orchestration/service";
import { clarificationSchema, roleProposalSchema } from "@/domain/ai/contracts";
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
