import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createDatabaseClient } from "@/lib/db/client";
import { projectService } from "@/services/projects/service";

describe("persistent project service", () => {
  let directory: string;
  let client: ReturnType<typeof createDatabaseClient>;
  let databaseUrl: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "ai-pm-projects-"));
    databaseUrl = `file:${join(directory, "test.db")}`;
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    client = createDatabaseClient(databaseUrl);
  }, 30_000);
  afterAll(async () => { await client?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });

  it("validates and trims creation input before writing", async () => {
    const service = projectService(client);
    expect(() => service.create({ name: "   " })).toThrow();
    expect(() => service.create({ name: "x".repeat(121) })).toThrow();
    expect(() => service.create({ name: "Projekt", currentStage: "grooming" })).toThrow();
    const project = await service.create({ name: "  Spordiklubi  ", description: "  Broneerimine  " });
    expect(project).toMatchObject({ name: "Spordiklubi", description: "Broneerimine", currentStage: "idea", recommendedNextStage: "idea" });
  });

  it("persists project and stage after disconnecting and opening a new connection", async () => {
    const project = await projectService(client).create({ name: "Taaskäivitus", description: "Püsiv idee" });
    await projectService(client).setStage(project.id, { currentStage: "prototype" });
    await client.$disconnect();
    client = createDatabaseClient(databaseUrl);
    const reopened = await projectService(client).get(project.id);
    expect(reopened).toMatchObject({ name: "Taaskäivitus", description: "Püsiv idee", currentStage: "prototype", recommendedNextStage: "idea" });
    expect((await projectService(client).list()).some(item => item.id === project.id)).toBe(true);
  });

  it("allows non-linear navigation without changing other project state", async () => {
    const project = await projectService(client).create({ name: "Eraldatud" });
    const other = await projectService(client).create({ name: "Teine projekt" });
    const story = await client.story.create({ data: { projectId: project.id, role: "Liige", action: "broneerida", benefit: "koht on tagatud", position: 0 } });
    const message = await client.conversationMessage.create({ data: { projectId: project.id, role: "user", messageType: "text", content: "Algne idee" } });
    for (const stage of ["grooming", "roles", "idea"] as const) await projectService(client).setStage(project.id, { currentStage: stage });
    expect(await client.story.findUnique({ where: { id: story.id } })).toEqual(story);
    expect(await client.conversationMessage.findUnique({ where: { id: message.id } })).toEqual(message);
    expect((await projectService(client).get(project.id))?._count.stories).toBe(1);
    expect(await client.project.findUnique({ where: { id: other.id } })).toEqual(other);
    expect(await client.proposal.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("rejects invalid stages and fields, and safely handles missing projects", async () => {
    const service = projectService(client);
    const project = await service.create({ name: "Validatsioon" });
    expect(() => service.setStage(project.id, { currentStage: "unknown" })).toThrow();
    expect(() => service.setStage(project.id, { currentStage: "roles", recommendedNextStage: "roles" })).toThrow();
    expect(await service.get("missing-project")).toBeNull();
    await expect(service.setStage("missing-project", { currentStage: "roles" })).rejects.toMatchObject({ code: "P2025" });
  });

  it("excludes archived stories from the project list count", async () => {
    const project = await projectService(client).create({ name: "Arhiveeritud" });
    await client.story.create({ data: { projectId: project.id, role: "Liige", action: "vaadata", benefit: "tean", position: 0, archivedAt: new Date() } });
    expect((await projectService(client).list()).find(item => item.id === project.id)?._count.stories).toBe(0);
  });
});
