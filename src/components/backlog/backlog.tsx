"use client";
import { useEffect, useState, type FormEvent } from "react";
import { MockupEditor } from "@/components/mockup/editor";
import { mockupElementIds } from "@/domain/criteria/validation";
import { useRouter } from "next/navigation";
import type { storyService } from "@/services/stories/service";
import type { ReadinessIssue } from "@/domain/readiness/readiness";
export type BacklogData = Awaited<ReturnType<ReturnType<typeof storyService>["get"]>>;
type Story = BacklogData["stories"][number];
type Command = Record<string, unknown>;
type Mutate = (command: Command) => Promise<boolean>;
const statusLabels = { idea: "Idee", needs_clarification: "Vajab täpsustamist", reviewed: "Läbivaadatud", ready_for_development: "Valmis arenduseks" };

function StoryForm({ story, mutate, busy, close }: { story?: Story; mutate: Mutate; busy: boolean; close?: () => void }) {
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  if (await mutate({ type: story ? "update_story" : "create_story", ...(story ? { storyId: story.id } : {}), role: data.get("role"), action: data.get("action"), benefit: data.get("benefit"), status: data.get("status"), size: data.get("size") || null, requiresMockup: data.get("requiresMockup") === "on" })) close?.();
 }
 return <form className="backlog-form" onSubmit={submit}>
  <label>Roll<input name="role" defaultValue={story?.role} maxLength={200} /></label>
  <label>Tegevus<input name="action" defaultValue={story?.action} maxLength={1000} /></label>
  <label>Kasu<input name="benefit" defaultValue={story?.benefit} maxLength={1000} /></label>
  <div className="form-row"><label>Staatus<select aria-label="Staatus" name="status" defaultValue={story?.status ?? "idea"}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
  <label>Suurus<select aria-label="Suurus" name="size" defaultValue={story?.size ?? ""}><option value="">Määramata</option>{["S", "M", "L"].map(size => <option key={size}>{size}</option>)}</select></label></div>
  <label className="checkbox-label"><input type="checkbox" name="requiresMockup" defaultChecked={story?.requiresMockup ?? true} />Lugu vajab kasutajaliidest ja mockup&apos;i</label>
  <div className="actions"><button disabled={busy} className="primary-button">{story ? "Salvesta lugu" : "Lisa lugu"}</button>{close && <button type="button" disabled={busy} onClick={close}>Loobu</button>}</div>
 </form>;
}
function CriterionForm({ storyId, criterion, mutate, busy }: { storyId: string; criterion?: Story["criteria"][number]; mutate: Mutate; busy: boolean }) {
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
  if (await mutate({ type: criterion ? "update_criterion" : "create_criterion", storyId, ...(criterion ? { criterionId: criterion.id } : {}), text: data.get("text"), mockupElementIds: String(data.get("references") || "").split(",").map(id => id.trim()).filter(Boolean) })) if (!criterion) form.reset();
 }
 return <form className="backlog-form criterion-form" onSubmit={submit}>
  <label>{criterion ? "Kriteeriumi tekst" : "Uus kriteerium"}<textarea name="text" defaultValue={criterion?.text} maxLength={2000} rows={2} /></label>
  <label>Mockup-elementide ID-d<input name="references" defaultValue={criterion ? criterion.mockupElementIds.join(", ") : ""} placeholder="ID-d komadega eraldatult" maxLength={10000} /></label>
  <div className="actions"><button disabled={busy}>{criterion ? "Salvesta kriteerium" : "Lisa kriteerium"}</button>{criterion && <button type="button" disabled={busy} onClick={() => mutate({ type: "delete_criterion", storyId, criterionId: criterion.id })}>Kustuta kriteerium</button>}</div>
 </form>;
}
function QuestionForm({ storyId, question, mutate, busy }: { storyId: string; question?: Story["openQuestions"][number]; mutate: Mutate; busy: boolean }) {
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
  if (await mutate({ type: question ? "update_question" : "create_question", storyId, ...(question ? { questionId: question.id, resolved: data.get("resolved") === "on" } : {}), text: data.get("text") })) if (!question) form.reset();
 }
 return <form className="backlog-form" onSubmit={submit}>
  <label>{question ? "Küsimuse tekst" : "Uus küsimus"}<textarea name="text" defaultValue={question?.text} required maxLength={2000} rows={2} /></label>
  {question && <label className="checkbox-label"><input type="checkbox" name="resolved" defaultChecked={!!question.resolvedAt} />Lahendatud</label>}
  <div className="actions"><button disabled={busy}>{question ? "Salvesta küsimus" : "Lisa küsimus"}</button>{question && <button type="button" disabled={busy} onClick={() => mutate({ type: "delete_question", storyId, questionId: question.id })}>Kustuta küsimus</button>}</div>
 </form>;
}
export function Backlog({ projectId, initial }: { projectId: string; initial: BacklogData }) {
 const router = useRouter(); const [data, setData] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
 const [issues, setIssues] = useState<ReadinessIssue[]>([]); const [creating, setCreating] = useState(false); const [dragId, setDragId] = useState<string | null>(null);
 useEffect(() => {
  async function sync(event: Event) {
   if (event instanceof CustomEvent && event.detail !== projectId) return;
   try { const response = await fetch(`/api/projects/${projectId}/backlog`); if (response.ok) setData(await response.json()); } catch { /* Keep the current manual state. */ }
  }
  window.addEventListener("backlog-updated", sync); return () => window.removeEventListener("backlog-updated", sync);
 }, [projectId]);
 const story = data.stories.find(item => item.id === data.selectedStoryId);
 async function mutate(command: Command) {
  if (busy) return false; setBusy(true); setError(""); setIssues([]); setNotice("");
  try {
   const response = await fetch(`/api/projects/${projectId}/backlog`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) }); const result = await response.json();
   if (!response.ok) { setIssues(result.issues ?? []); throw new Error(result.error); }
   if (command.type === "archive_story" && data.mvpBoundaryAfterStoryId === command.storyId) setNotice("MVP piir eemaldati koos looga. Määra MVP piir uuesti.");
   if (command.type !== "select" && command.type !== "undo") setNotice(previous => previous || "Muudatus salvestatud. Saad viimase muudatuse tagasi võtta.");
   if (command.type === "undo") setNotice("Viimane muudatus on tagasi võetud.");
   setData(result); router.refresh(); return true;
  } catch (cause) { setError(cause instanceof Error ? cause.message : "Salvestamine ebaõnnestus."); return false; }
  finally { setBusy(false); }
 }
 function move(id: string, destination: number) {
  const ids = data.stories.map(item => item.id); const position = ids.indexOf(id); if (position < 0 || destination < 0 || destination >= ids.length || destination === position) return;
  ids.splice(position, 1); ids.splice(destination, 0, id); void mutate({ type: "reorder", storyIds: ids });
 }
 const areaId = (area: ReadinessIssue["area"]) => `story-${area}`;
 return <div className="manual-backlog">
  <div className="backlog-heading"><h2>Backlog</h2><span className="count-badge">{data.stories.length}</span></div>
  <div className="actions"><button disabled={busy} onClick={() => { setCreating(!creating); setError(""); setIssues([]); }}>Uus lugu</button><button disabled={busy || !data.canUndo} onClick={() => mutate({ type: "undo" })}>Võta tagasi</button></div>
  {notice && <p role="status" className="muted">{notice}</p>}
  {error && <div role="alert" className="error"><p>{error}</p>{issues.length > 0 && <ul>{issues.map((issue, i) => <li key={i}><a href={`#${areaId(issue.area)}`}>{issue.message}</a></li>)}</ul>}</div>}
  {creating && <section className="story-create"><h3>Uus kasutajalugu</h3><StoryForm mutate={mutate} busy={busy} close={() => setCreating(false)} /></section>}
  {!data.stories.length && <div className="backlog-empty"><h3>Lugude jaoks on ruumi.</h3><p>Lisa esimene kasutajalugu käsitsi. AI võtit pole vaja.</p></div>}
  <ol className="story-list">{data.stories.map((item, index) => <li key={item.id}>
   <article className={`story-card ${item.id === story?.id ? "selected" : ""}`} draggable={!busy} onDragStart={event => { setDragId(item.id); event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragId(null)} onDragOver={event => { if (dragId) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragId) move(dragId, index); setDragId(null); }}>
    <button className="story-title" disabled={busy} onClick={async () => { if (await mutate({ type: "select", storyId: item.id })) setCreating(false); }}>{index + 1}. {item.role}na soovin {item.action}, et {item.benefit}.</button>
    <p className="story-meta">{statusLabels[item.status]} · {item.size ?? "Suurus määramata"} · {item.origin === "manual" ? "Käsitsi" : "AI"}<br />{item.criteria.length} kriteeriumi · {mockupElementIds(item.mockupVersions[0]?.structureJson).length ? "Mockup olemas" : "Mockup puudub"} · {item.openQuestions.filter(q => !q.resolvedAt).length} avatud küsimust</p>
    <div className="actions"><button aria-label={`Liiguta lugu ${index + 1} üles`} disabled={busy || index === 0} onClick={() => move(item.id, index - 1)}>↑</button><button aria-label={`Liiguta lugu ${index + 1} alla`} disabled={busy || index === data.stories.length - 1} onClick={() => move(item.id, index + 1)}>↓</button><button disabled={busy} onClick={() => mutate({ type: "boundary", storyId: item.id })}>MVP piir siia</button></div>
   </article>{data.mvpBoundaryAfterStoryId === item.id && <div className="mvp-line"><strong>MVP piir</strong><button disabled={busy} onClick={() => mutate({ type: "boundary", storyId: null })}>Eemalda piir</button></div>}
  </li>)}</ol>
  {story && !creating && <section className="story-inspector" key={`${story.id}-${story.version}`} aria-label="Valitud kasutajalugu">
   <div id="story-story"><h3>Valitud kasutajalugu</h3><p className="muted">Versioon {story.version} · {story.origin === "manual" ? "Käsitsi loodud" : "AI loodud"}</p><StoryForm story={story} mutate={mutate} busy={busy} /></div>
   <details className="readiness" open><summary>Definition of Ready: {story.readiness.ready ? "tingimused täidetud" : "vajab tööd"}</summary>{story.readiness.issues.length > 0 && <ul>{story.readiness.issues.map((issue, i) => <li key={i}><a href={`#${areaId(issue.area)}`}>{issue.message}</a></li>)}</ul>}</details>
   <section id="story-criteria"><h3>Vastuvõtukriteeriumid</h3>{story.criteria.map((criterion, i) => <div className="child-card" key={criterion.id}><p className={`validation-${criterion.check.status}`}>{i + 1}. {criterion.check.status === "pass" ? "Kontroll läbitud" : criterion.check.status === "warning" ? "Hoiatus" : "Vigane"}</p>{criterion.check.messages.map(message => <p className="validation-note" key={message.code}>{message.message}</p>)}<CriterionForm storyId={story.id} criterion={criterion} mutate={mutate} busy={busy} /></div>)}<CriterionForm storyId={story.id} mutate={mutate} busy={busy} /></section>
   <section id="story-mockup"><h3>Mockup</h3><p className="muted">Praeguse mockupi elementide ID-d: {mockupElementIds(story.mockupVersions[0]?.structureJson).join(", ") || "puuduvad"}. Kasuta neid kriteeriumide viidetes.</p><MockupEditor storyId={story.id} versions={story.mockupVersions} busy={busy} mutate={mutate} /></section>
   <section id="story-questions"><h3>Avatud küsimused</h3>{story.openQuestions.map(question => <div className="child-card" key={question.id}><p>{question.resolvedAt ? "Lahendatud" : "Lahendamata"}</p><QuestionForm storyId={story.id} question={question} mutate={mutate} busy={busy} /></div>)}<QuestionForm storyId={story.id} mutate={mutate} busy={busy} /></section>
   <button className="archive-button" disabled={busy} onClick={() => mutate({ type: "archive_story", storyId: story.id })}>Arhiveeri lugu</button>
  </section>}
 </div>;
}
