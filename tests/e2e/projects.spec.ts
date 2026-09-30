import { test, expect } from "@playwright/test";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let directory: string;
let server: ChildProcess | undefined;
let databaseUrl: string;
let logs = "";
let aiProvider = "fixture";
const origin = "http://127.0.0.1:3100";

async function startServer() {
  logs = "";
  server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3100"], {
    env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: "1", AI_PROVIDER: aiProvider, OPENAI_API_KEY: "e2e-provider-key-never-public", OPENAI_MODEL: "" }, stdio: ["ignore", "pipe", "pipe"],
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
  const databasePath = join(directory, "e2e.db");
  await writeFile(databasePath, "");
  databaseUrl = `file:${databasePath}`;
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

test("manual backlog, readiness, ordering, MVP and one-level undo work without AI", async ({ page, request }, testInfo) => {
  const created = await request.post("/api/projects", { data: { name: "Käsitsi backlog" } }); const project = await created.json();
  await page.goto(`/projects/${project.id}`);
  const backlog = page.locator("#panel-backlog");
  async function addStory(action: string) {
    await backlog.getByRole("button", { name: "Uus lugu", exact: true }).click();
    const form = backlog.locator(".story-create");
    await form.getByLabel("Roll", { exact: true }).fill("Liige"); await form.getByLabel("Tegevus", { exact: true }).fill(action); await form.getByLabel("Kasu", { exact: true }).fill("koht oleks tagatud");
    await form.getByLabel("Lugu vajab kasutajaliidest").uncheck(); await form.getByRole("button", { name: "Lisa lugu", exact: true }).click();
    await expect(backlog.getByRole("region", { name: "Valitud kasutajalugu" })).toBeVisible();
  }
  await addStory("broneerida treeningu");
  let inspector = backlog.getByRole("region", { name: "Valitud kasutajalugu" });
  await inspector.getByLabel("Staatus", { exact: true }).selectOption("ready_for_development"); await inspector.getByRole("button", { name: "Salvesta lugu", exact: true }).click();
  await expect(backlog.getByRole("alert")).toContainText("Lisa vähemalt kolm");
  await expect(backlog.locator(".story-card")).toContainText("Idee");
  for (const text of ["Teenus salvestab broneeringu.", "Teenus saadab kinnituse e-postiga.", "Teenus keeldub täis treeningu broneerimisest."]) {
    await inspector.getByLabel("Uus kriteerium", { exact: true }).fill(text); await inspector.getByRole("button", { name: "Lisa kriteerium", exact: true }).click(); await expect(inspector.getByLabel("Uus kriteerium", { exact: true })).toHaveValue("");
  }
  await inspector.getByLabel("Staatus", { exact: true }).selectOption("ready_for_development"); await inspector.getByRole("button", { name: "Salvesta lugu", exact: true }).click(); await expect(backlog.locator(".story-card")).toContainText("Valmis arenduseks");
  await inspector.getByLabel("Uus küsimus").fill("Kas käibemaks on hinnas?"); await inspector.getByRole("button", { name: "Lisa küsimus", exact: true }).click(); await expect(backlog.locator(".story-card")).toContainText("Vajab täpsustamist");
  await backlog.getByRole("button", { name: "Võta tagasi", exact: true }).click(); await expect(backlog.locator(".story-card")).toContainText("Valmis arenduseks"); await expect(backlog.getByRole("button", { name: "Võta tagasi", exact: true })).toBeDisabled();
  await addStory("muuta broneeringut");
  await backlog.locator(".story-card").nth(0).getByRole("button", { name: "MVP piir siia" }).click(); await expect(backlog.locator(".mvp-line")).toBeVisible();
  await backlog.getByRole("button", { name: "Liiguta lugu 2 üles" }).click(); await expect(backlog.locator(".story-card").nth(0)).toContainText("muuta broneeringut");
  await backlog.locator(".story-card").nth(0).dragTo(backlog.locator(".story-card").nth(1)); await expect(backlog.locator(".story-card").nth(0)).toContainText("broneerida treeningu");
  await backlog.locator(".story-title").nth(0).click(); inspector = backlog.getByRole("region", { name: "Valitud kasutajalugu" });
  await inspector.getByLabel("Kriteeriumi tekst").nth(0).fill("Teenuse kasutamine on kiire ja mugav."); await inspector.getByRole("button", { name: "Salvesta kriteerium", exact: true }).nth(0).click(); await expect(inspector.getByText("Hoiatus", { exact: false }).first()).toBeVisible(); await expect(backlog.locator(".story-card").nth(0)).toContainText("Vajab täpsustamist");
  await backlog.getByRole("button", { name: "Võta tagasi", exact: true }).click(); await expect(inspector.getByLabel("Kriteeriumi tekst").nth(0)).toHaveValue("Teenus salvestab broneeringu.");
  await inspector.getByRole("button", { name: "Arhiveeri lugu" }).click(); await expect(backlog.locator(".mvp-line")).toHaveCount(0); await expect(backlog.getByRole("status")).toContainText("MVP piir eemaldati");
  await backlog.getByRole("button", { name: "Võta tagasi", exact: true }).click(); await expect(backlog.locator(".story-card")).toHaveCount(2); await expect(backlog.locator(".mvp-line")).toBeVisible();
  await page.reload(); await expect(backlog.getByRole("region", { name: "Valitud kasutajalugu" })).toBeVisible(); await expect(backlog.locator(".mvp-line")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("manual-backlog-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("tab", { name: "Backlog" }).click();
  await expect(inspector.getByLabel("Uus küsimus")).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("manual-backlog-mobile.png"), fullPage: true });
  const other = await (await request.post("/api/projects", { data: { name: "Teine backlog" } })).json();
  const state = await (await request.get(`/api/projects/${project.id}/backlog`)).json();
  expect((await request.post(`/api/projects/${other.id}/backlog`, { data: { type: "select", storyId: state.stories[0].id } })).status()).toBe(404);
  expect((await request.post(`/api/projects/${project.id}/backlog`, { data: { type: "reorder", storyIds: [state.stories[0].id, state.stories[0].id] } })).status()).toBe(400);
});


test("manual mockup editing, safe rendering, history and restore persist", async ({ page, request }, testInfo) => {
  const project = await (await request.post("/api/projects", { data: { name: "Mockupi ajalugu" } })).json();
  const state = await (await request.post(`/api/projects/${project.id}/backlog`, { data: { type: "create_story", role: "Liige", action: "broneerida treeningu", benefit: "koht oleks tagatud", status: "idea", size: null, requiresMockup: true } })).json();
  await page.goto(`/projects/${project.id}`);
  const mockup = page.locator("#story-mockup");
  await mockup.getByText("Mockupi käsitsi lisamine või muutmine", { exact: true }).click();
  await mockup.getByRole("button", { name: "Salvesta uus mockup-versioon" }).click();
  await expect(mockup.getByLabel("Versiooniajalugu")).toContainText("v1");
  await expect(mockup.locator('[data-mockup-element-id="book"]').first()).toBeVisible();
  await expect(mockup.getByRole("button", { name: "Kinnita broneering", exact: true }).first()).toBeDisabled();
  await mockup.getByRole("button", { name: "Muuda seda versiooni", exact: true }).click();
  await mockup.getByRole("button", { name: "Broneeringute ülevaade", exact: true }).click();
  await mockup.getByRole("button", { name: "Salvesta uus mockup-versioon" }).click();
  await expect(mockup.getByLabel("Versiooniajalugu")).toContainText("v2");
  let current = await (await request.get(`/api/projects/${project.id}/backlog`)).json(); const first = current.stories[0].mockupVersions.find((v: { version: number }) => v.version === 1);
  await mockup.getByLabel("Versiooniajalugu").selectOption(first.id);
  await mockup.getByRole("button", { name: "Taasta uue versioonina" }).click();
  await expect(mockup.getByLabel("Versiooniajalugu")).toContainText("v3");
  await page.reload(); await expect(mockup.getByLabel("Versiooniajalugu")).toContainText("v3");
  await page.screenshot({ path: testInfo.outputPath("mockup-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("tab", { name: "Backlog" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mockup-mobile.png"), fullPage: true });
  current = await (await request.get(`/api/projects/${project.id}/backlog`)).json();
  expect(current.stories[0].mockupVersions).toHaveLength(3);
  const before = JSON.stringify(current);
  expect((await request.post(`/api/projects/${project.id}/backlog`, { data: { type: "save_mockup", storyId: state.stories[0].id, name: "Unsafe", document: { schemaVersion: 1, screenName: "Unsafe", elements: [{ id: "script", type: "text", props: { onClick: "alert(1)" } }] } } })).status()).toBe(400);
  expect(JSON.stringify(await (await request.get(`/api/projects/${project.id}/backlog`)).json())).toBe(before);
});


test("guided fixture conversation choices, Other, Skip, multi-selection and roles persist", async ({ page, request }, testInfo) => {
  const created = await request.post("/api/projects", { data: { name: "AI spordiklubi", description: "Spordiklubi rakendus" } });
  const project = await created.json();
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByText("Näidis-AI · fixture")).toBeVisible();
  await page.getByLabel("Sinu idee või täpsustus").fill("Soovin spordiklubile rakendust.");
  await page.getByRole("button", { name: "Saada sõnum" }).click();
  await expect(page.getByRole("group", { name: "Millist põhiprobleemi soovid kõigepealt lahendada?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Muu (kirjutan ise)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jäta vahele" })).toBeVisible();
  await page.getByRole("button", { name: "Treeningute broneerimine" }).click();
  await expect(page.getByRole("heading", { name: "Rollide ettepanek", exact: true })).toBeVisible();
  await expect(page.getByText("Treener", { exact: true })).toBeVisible();
  let backlog = await (await request.get(`/api/projects/${project.id}/backlog`)).json();
  expect(backlog.stories).toHaveLength(0);
  await page.getByRole("button", { name: "Täpsusta ideed", exact: true }).click();
  const group = page.getByRole("group", { name: "Kes kasutab lahendust kõige rohkem?" });
  await group.getByRole("button", { name: "Liikmed või kliendid" }).click();
  await group.getByRole("button", { name: "Töötajad", exact: true }).click();
  await expect(group.getByRole("button", { name: "Töötajad", exact: true })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "Saada vastus" }).click();
  await expect(page.getByText(/Liikmed või kliendid, Töötajad/, { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rollide ettepanek", exact: true })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("conversation-desktop.png"), fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Rollide ettepanek", exact: true })).toHaveCount(2);
  await page.getByLabel("Sinu idee või täpsustus").fill("Treener on peamine kasutaja.");
  await page.getByRole("button", { name: "Saada sõnum" }).click();
  await expect(page.getByRole("heading", { name: "Rollide ettepanek", exact: true })).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("conversation-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  backlog = await (await request.get(`/api/projects/${project.id}/backlog`)).json();
  expect(backlog.stories).toHaveLength(0);
  for (const skip of [false, true]) {
    const response = await request.post("/api/projects", { data: { name: skip ? "Skip flow" : "Other flow" } });
    const p = await response.json(); await page.goto(`/projects/${p.id}`);
    await page.getByLabel("Sinu idee või täpsustus").fill("Uus idee"); await page.getByRole("button", { name: "Saada sõnum" }).click();
    if (skip) await page.getByRole("button", { name: "Jäta vahele" }).click();
    else { await page.getByRole("button", { name: "Muu (kirjutan ise)" }).click(); await page.getByLabel("Muu vastus", { exact: true }).fill("<script>literal answer</script>"); await page.getByRole("button", { name: "Saada vastus" }).click(); }
    await expect(page.getByRole("heading", { name: "Rollide ettepanek", exact: true })).toBeVisible();
    const history = await (await request.get(`/api/projects/${p.id}/conversation`)).json();
    expect(history.messages[2].content).toContain(skip ? "Jäta vahele" : "Muu: <script>literal answer</script>");
    await expect(page.locator(".conversation script")).toHaveCount(0);
  }
});

test("unavailable AI saves messages, safe retry and manual backlog remain usable", async ({ page, request }) => {
  await stopServer(); aiProvider = "unavailable"; await startServer();
  try {
    const response = await request.post("/api/projects", { data: { name: "AI unavailable" } }); const p = await response.json();
    await page.goto(`/projects/${p.id}`);
    await expect(page.getByText("AI pole seadistatud", { exact: true })).toBeVisible();
    await page.getByLabel("Sinu idee või täpsustus").fill("Sõnum peab säilima"); await page.getByRole("button", { name: "Saada sõnum" }).click();
    await expect(page.getByRole("button", { name: "Proovi vastust uuesti" })).toBeVisible();
    await page.getByRole("button", { name: "Proovi vastust uuesti" }).click();
    await expect(page.getByRole("button", { name: "Proovi vastust uuesti" })).toBeEnabled();
    let history = await (await request.get(`/api/projects/${p.id}/conversation`)).json();
    expect(history.messages.filter((m: { role: string }) => m.role === "user")).toHaveLength(1);
    expect(JSON.stringify(history)).not.toMatch(/e2e-provider-key-never-public|OPENAI_API_KEY|Authorization|stack|Bearer/);
    expect(await page.content()).not.toContain("e2e-provider-key-never-public");
    expect((await request.post(`/api/projects/${p.id}/conversation`, { data: { kind: "text", text: "x", task: "execute_script" } })).status()).toBe(400);
    await page.getByRole("button", { name: "Uus lugu", exact: true }).click();
    const form = page.locator(".story-create");
    await form.getByLabel("Roll", { exact: true }).fill("Liige"); await form.getByLabel("Tegevus", { exact: true }).fill("broneerida"); await form.getByLabel("Kasu", { exact: true }).fill("saan treenida");
    await form.getByRole("button", { name: "Lisa lugu", exact: true }).click();
    await expect(page.getByRole("button", { name: "Liigena soovin broneerida, et saan treenida." })).toBeVisible();
    await page.reload(); await expect(page.getByText("Sõnum peab säilima", { exact: true })).toBeVisible();
    await stopServer(); aiProvider = "fixture"; await startServer();
    await page.reload(); await page.getByRole("button", { name: "Proovi vastust uuesti" }).click();
    await expect(page.getByRole("group", { name: "Millist põhiprobleemi soovid kõigepealt lahendada?" })).toBeVisible();
    history = await (await request.get(`/api/projects/${p.id}/conversation`)).json();
    expect(history.messages.filter((m: { role: string }) => m.role === "user")).toHaveLength(1);
  } finally { if (aiProvider !== "fixture") { await stopServer(); aiProvider = "fixture"; await startServer(); } }
});
