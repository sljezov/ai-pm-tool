import { test, expect } from "@playwright/test";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let directory: string;
let server: ChildProcess | undefined;
let databaseUrl: string;
let logs = "";
const origin = "http://127.0.0.1:3100";

async function startServer() {
  logs = "";
  server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3100"], {
    env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", chunk => { logs += chunk.toString(); });
  server.stderr?.on("data", chunk => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Test server stopped: ${logs}`);
    try { const response = await fetch(origin); if (response.ok) return; } catch { /* Wait for server startup. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Test server did not start: ${logs}`);
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const child = server;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Test server did not stop")); }, 10_000);
    child.once("exit", () => { clearTimeout(timeout); resolve(); });
    child.kill("SIGTERM");
  });
  server = undefined;
}

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "ai-pm-browser-"));
  databaseUrl = `file:${join(directory, "e2e.db")}`;
  execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
  await startServer();
});
test.afterAll(async () => { await stopServer(); if (directory) await rm(directory, { recursive: true, force: true }); });

test("create, navigate, restart server, and reopen persisted project", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByText("Iga hea toode algab ühest ideest.")).toBeVisible();
  await page.getByLabel("Projekti nimi").fill("Spordiklubi test");
  await page.getByLabel("Lühikirjeldus").fill("Liikmed saavad treeninguid broneerida.");
  await page.getByRole("button", { name: "Loo projekt" }).click();
  await expect(page.getByRole("heading", { name: "Spordiklubi test" })).toBeVisible();
  const projectUrl = page.url();
  await page.getByRole("button", { name: "07 Groomimine" }).click();
  await expect(page.getByRole("heading", { name: "Groomimine", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "02 Rollid" }).click();
  await expect(page.getByRole("heading", { name: "Rollid", exact: true })).toBeVisible();
  await stopServer();
  await startServer();
  await page.goto("/");
  await page.getByRole("link", { name: /Spordiklubi test/ }).click();
  await expect(page).toHaveURL(projectUrl);
  await expect(page.getByRole("heading", { name: "Rollid", exact: true })).toBeVisible();
  await expect(page.getByText("Liikmed saavad treeninguid broneerida.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Rollid", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workspace-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Etapid" }).click();
  await page.getByRole("button", { name: "05 Kriteeriumid ja mockup" }).click();
  await page.getByRole("tab", { name: "Tööruum" }).click();
  await expect(page.getByRole("heading", { name: "Kriteeriumid ja mockup", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workspace-mobile.png"), fullPage: true });
  await page.getByRole("tab", { name: "Backlog" }).click();
  await expect(page.getByText("Lugude jaoks on ruumi.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("API validation returns useful errors without mutating state", async ({ request }) => {
  const created = await request.post("/api/projects", { data: { name: "API validation" } });
  expect(created.status()).toBe(201);
  const project = await created.json();
  const before = await (await request.get("/api/projects")).json();
  expect((await request.post("/api/projects", { data: { name: " " } })).status()).toBe(400);
  expect((await request.post("/api/projects", { data: "{invalid", headers: { "Content-Type": "application/json" } })).status()).toBe(400);
  expect((await request.patch(`/api/projects/${project.id}`, { data: { currentStage: "invalid" } })).status()).toBe(400);
  expect((await request.get("/api/projects/missing")).status()).toBe(404);
  expect((await request.patch("/api/projects/missing", { data: { currentStage: "roles" } })).status()).toBe(404);
  expect(await (await request.get("/api/projects")).json()).toEqual(before);
});
