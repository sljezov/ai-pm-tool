"use client";
import { Backlog, type BacklogData } from "@/components/backlog/backlog";
import Link from "next/link";
import { Conversation } from "@/components/conversation/conversation";
import type { ConversationData } from "@/domain/ai/contracts";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { stages, stageLabels, stageDescriptions, type ProjectStage } from "@/domain/stages/stages";

type Project = { id: string; name: string; description: string; currentStage: ProjectStage; recommendedNextStage: ProjectStage; storyCount: number };
export function Workspace({ project, backlog, conversation }: { project: Project; backlog: BacklogData; conversation: ConversationData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("work");
  const tabIds = ["stages", "work", "backlog"] as const;
  function moveTab(current: string, direction: number) {
    const index = tabIds.indexOf(current as (typeof tabIds)[number]);
    const next = tabIds[(index + direction + tabIds.length) % tabIds.length];
    setTab(next); document.getElementById(`tab-${next}`)?.focus();
  }
  async function navigate(currentStage: ProjectStage) {
    if (busy || currentStage === project.currentStage) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentStage }) });
      if (!response.ok) throw new Error((await response.json()).error);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Etapi muutmine ebaõnnestus."); }
    finally { setBusy(false); }
  }
  return <main className="workspace-page">
    <div className="workspace-heading"><div><Link className="back-link" href="/">← Kõik projektid</Link><h1>{project.name}</h1></div><span className="stage-badge">{stageLabels[project.currentStage]}</span></div>
    <div className="mobile-tabs" role="tablist" aria-label="Tööruumi vaade">{[["stages", "Etapid"], ["work", "Tööruum"], ["backlog", "Backlog"]].map(([id, label]) => <button key={id} id={`tab-${id}`} role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`panel-${id}`} onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); moveTab(id, 1); } else if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(id, -1); } }} onClick={() => setTab(id)}>{label}</button>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="workspace-grid">
      <nav id="panel-stages" role="tabpanel" aria-labelledby="tab-stages" className={`stage-nav mobile-${tab === "stages" ? "visible" : "hidden"}`} aria-label="Projekti etapid"><p className="eyebrow">PROJEKTI TEEKOND</p>{stages.map((stage, index) => <button key={stage} className={stage === project.currentStage ? "stage-item active" : "stage-item"} aria-current={stage === project.currentStage ? "step" : undefined} disabled={busy} onClick={() => navigate(stage)}><span className="stage-number">{String(index + 1).padStart(2, "0")}</span><span>{stageLabels[stage]}</span></button>)}<p className="nav-note">Võid etappe vabalt valida ja nende juurde tagasi tulla.</p></nav>
      <section id="panel-work" role="tabpanel" className={`work-panel mobile-${tab === "work" ? "visible" : "hidden"}`} aria-labelledby="tab-work stage-heading" aria-busy={busy}><p className="eyebrow">ETAPP {String(stages.indexOf(project.currentStage) + 1).padStart(2, "0")}</p><h2 id="stage-heading">{stageLabels[project.currentStage]}</h2><p className="muted">{stageDescriptions[project.currentStage]}</p>
        <div className="idea-note"><span className="eyebrow">PROJEKTI IDEE</span><p>{project.description || "Sellel projektil pole veel kirjeldust."}</p></div>
        <section className="resume-card" aria-labelledby="resume-heading"><div><span className="eyebrow">JÄTKA SIIT</span><h3 id="resume-heading">{stageLabels[project.recommendedNextStage]}</h3><p>{stageDescriptions[project.recommendedNextStage]}</p></div><button className="primary-button" onClick={() => navigate(project.recommendedNextStage)} disabled={busy || project.currentStage === project.recommendedNextStage}>{project.currentStage === project.recommendedNextStage ? "Praegu avatud" : "Ava soovitatud etapp"}</button></section>
        <Conversation key={project.id} projectId={project.id} initial={conversation} />
        <div className="next-step"><span>Soovitatud järgmine etapp</span><button className="text-button" onClick={() => navigate(project.recommendedNextStage)} disabled={busy}>{stageLabels[project.recommendedNextStage]} <span aria-hidden="true">→</span></button></div>
      </section>
      <aside id="panel-backlog" role="tabpanel" aria-labelledby="tab-backlog" className={`backlog-panel mobile-${tab === "backlog" ? "visible" : "hidden"}`}><Backlog projectId={project.id} initial={backlog} /></aside>
    </div>
  </main>;
}
