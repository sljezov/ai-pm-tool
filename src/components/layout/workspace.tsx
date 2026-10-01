"use client";
import { Backlog, type BacklogData } from "@/components/backlog/backlog";
import Link from "next/link";
import { Conversation } from "@/components/conversation/conversation";
import type { ConversationData } from "@/domain/ai/contracts";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stages, stageLabels, stageDescriptions, type ProjectStage } from "@/domain/stages/stages";

type Project = { id: string; name: string; description: string; currentStage: ProjectStage; recommendedNextStage: ProjectStage; storyCount: number };
export function Workspace({ project, backlog, conversation }: { project: Project; backlog: BacklogData; conversation: ConversationData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("vestlus");
  const [backlogDirty, setBacklogDirty] = useState(false);
  const tabIds = ["vestlus", "backlog"] as const;
  function moveTab(current: string, direction: number) {
    const index = tabIds.indexOf(current as (typeof tabIds)[number]);
    const next = tabIds[(index + direction + tabIds.length) % tabIds.length];
    selectTab(next); document.getElementById(`tab-${next}`)?.focus();
  }
  function selectTab(id: string) { setTab(id); if (id === "backlog") setBacklogDirty(false); }
  useEffect(() => {
    function onBacklogUpdated(event: Event) {
      if (event instanceof CustomEvent && event.detail !== project.id) return;
      if (tab !== "backlog") setBacklogDirty(true);
    }
    window.addEventListener("backlog-updated", onBacklogUpdated);
    return () => window.removeEventListener("backlog-updated", onBacklogUpdated);
  }, [project.id, tab]);
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
    <div className="workspace-heading"><div><Link className="back-link" href="/">← Kõik projektid</Link><h1>{project.name}</h1></div></div>
    <div className="stage-steps" role="group" aria-label="Projekti etapid">{stages.map((stage, index) => <button key={stage} type="button" className={stage === project.currentStage ? "stage-step active" : "stage-step"} aria-current={stage === project.currentStage ? "step" : undefined} disabled={busy} onClick={() => navigate(stage)}><span className="stage-step-number">{String(index + 1).padStart(2, "0")}</span>{stageLabels[stage]}</button>)}</div>
    <div className="view-tabs" role="tablist" aria-label="Tööruumi vaade">{[["vestlus", "Vestlus"], ["backlog", "Backlog"]].map(([id, label]) => <button key={id} id={`tab-${id}`} role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`panel-${id}`} onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); moveTab(id, 1); } else if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(id, -1); } }} onClick={() => selectTab(id)}>{label}{id === "backlog" && backlogDirty && <span className="tab-dot" aria-hidden="true" />}</button>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="workspace-panels">
      <section id="panel-vestlus" role="tabpanel" className={`work-panel${tab === "vestlus" ? "" : " panel-hidden"}`} aria-labelledby="tab-vestlus stage-heading" aria-busy={busy}><p className="eyebrow">ETAPP {String(stages.indexOf(project.currentStage) + 1).padStart(2, "0")}</p><h2 id="stage-heading">{stageLabels[project.currentStage]}</h2><p className="muted">{stageDescriptions[project.currentStage]}</p>
        <div className="idea-note"><span className="eyebrow">PROJEKTI IDEE</span><p>{project.description || "Sellel projektil pole veel kirjeldust."}</p></div>
        {project.currentStage !== project.recommendedNextStage && <section className="resume-card" aria-labelledby="resume-heading"><div><span className="eyebrow">JÄTKA SIIT</span><h3 id="resume-heading">{stageLabels[project.recommendedNextStage]}</h3><p>{stageDescriptions[project.recommendedNextStage]}</p></div><button className="primary-button" onClick={() => navigate(project.recommendedNextStage)} disabled={busy}>Ava soovitatud etapp</button></section>}
        <Conversation key={project.id} projectId={project.id} initial={conversation} currentStage={project.currentStage} />
        {backlogDirty && <p className="backlog-update-notice"><button type="button" className="text-button" onClick={() => selectTab("backlog")}>Backlog uuenes →</button></p>}
        {project.currentStage !== project.recommendedNextStage && <div className="next-step"><span>Soovitatud järgmine etapp</span><button className="text-button" onClick={() => navigate(project.recommendedNextStage)} disabled={busy}>{stageLabels[project.recommendedNextStage]} <span aria-hidden="true">→</span></button></div>}
      </section>
      <section id="panel-backlog" role="tabpanel" aria-labelledby="tab-backlog" className={`backlog-panel${tab === "backlog" ? "" : " panel-hidden"}`}><Backlog projectId={project.id} initial={backlog} /></section>
    </div>
  </main>;
}
