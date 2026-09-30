"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { stages, stageLabels, stageDescriptions, type ProjectStage } from "@/domain/stages/stages";

type Project = { id: string; name: string; description: string; currentStage: ProjectStage; recommendedNextStage: ProjectStage; storyCount: number };
export function Workspace({ project }: { project: Project }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("work");
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
    <div className="mobile-tabs" role="tablist" aria-label="Tööruumi vaade">{[["stages", "Etapid"], ["work", "Tööruum"], ["backlog", "Backlog"]].map(([id, label]) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>{label}</button>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="workspace-grid">
      <nav id="panel-stages" className={`stage-nav mobile-${tab === "stages" ? "visible" : "hidden"}`} aria-label="Projekti etapid"><p className="eyebrow">PROJEKTI TEEKOND</p>{stages.map((stage, index) => <button key={stage} className={stage === project.currentStage ? "stage-item active" : "stage-item"} aria-current={stage === project.currentStage ? "step" : undefined} disabled={busy} onClick={() => navigate(stage)}><span className="stage-number">{String(index + 1).padStart(2, "0")}</span><span>{stageLabels[stage]}</span></button>)}<p className="nav-note">Võid etappe vabalt valida ja nende juurde tagasi tulla.</p></nav>
      <section id="panel-work" className={`work-panel mobile-${tab === "work" ? "visible" : "hidden"}`} aria-labelledby="stage-heading"><p className="eyebrow">ETAPP {String(stages.indexOf(project.currentStage) + 1).padStart(2, "0")}</p><h2 id="stage-heading">{stageLabels[project.currentStage]}</h2><p className="muted">{stageDescriptions[project.currentStage]}</p>
        <div className="idea-note"><span className="eyebrow">PROJEKTI IDEE</span><p>{project.description || "Sellel projektil pole veel kirjeldust."}</p></div>
        <div className="foundation-notice"><span aria-hidden="true">◇</span><h3>Tööruum on valmis.</h3><p>Projekt ja valitud etapp on salvestatud. Vestlus, kasutajalood ja AI ettepanekud lisanduvad järgmistes ehitusetappides.</p></div>
        <div className="next-step"><span>Soovitatud järgmine etapp</span><button className="text-button" onClick={() => navigate(project.recommendedNextStage)} disabled={busy}>{stageLabels[project.recommendedNextStage]} <span aria-hidden="true">→</span></button></div>
      </section>
      <aside id="panel-backlog" className={`backlog-panel mobile-${tab === "backlog" ? "visible" : "hidden"}`}><div className="backlog-heading"><h2>Backlog</h2><span className="count-badge">{project.storyCount}</span></div><div className="backlog-empty"><span aria-hidden="true">☷</span><h3>{project.storyCount === 0 ? "Lugude jaoks on ruumi." : `${project.storyCount} kasutajalugu`}</h3><p>Kasutajalugude haldus lisandub järgmises ehitusetapis.</p></div></aside>
    </div>
  </main>;
}
