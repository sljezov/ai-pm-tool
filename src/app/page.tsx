import Link from "next/link";
import { db } from "@/lib/db/client";
import { projectService } from "@/services/projects/service";
import { stageLabels } from "@/domain/stages/stages";
import { CreateProject } from "@/components/layout/create-project";
import { DeleteProject } from "@/components/layout/delete-project";

export const dynamic = "force-dynamic";
export default async function Home() {
  const projects = await projectService(db).list();
  return <main className="projects-page">
    <div className="page-intro"><div><p className="eyebrow">IDEEST ARENDUSENI</p><h1>Sinu projektid</h1><p className="muted">Üks koht ideede selgitamiseks ja järgmiste sammude otsustamiseks.</p></div><span className="project-total">{projects.length} {projects.length === 1 ? "projekt" : "projekti"}</span></div>
    <div className="projects-layout"><section aria-label="Projektid">
      {projects.length === 0 ? <div className="empty-projects"><span className="empty-icon">◇</span><h2>Iga hea toode algab ühest ideest.</h2><p>Projekt koondab sinu idee, kasutajarollid, lood ja vastuvõtukriteeriumid ühte tööruumi.</p><p className="muted">Loo esimene projekt, et alustada.</p></div> : <div className="project-grid">{projects.map(project => <div className="project-card" key={project.id}>
        <Link className="project-card-link" href={`/projects/${project.id}`}>
          <div className="card-top"><span className="stage-badge">{stageLabels[project.currentStage]}</span><span aria-hidden="true">↗</span></div><h2>{project.name}</h2><p className="project-description">{project.description || "Kirjeldus lisamata"}</p><div className="card-footer"><span>{project._count.stories} kasutajalugu</span><time dateTime={project.updatedAt.toISOString()}>{new Intl.DateTimeFormat("et-EE", { dateStyle: "medium", timeZone: "Europe/Tallinn" }).format(project.updatedAt)}</time></div>
        </Link>
        <DeleteProject projectId={project.id} projectName={project.name} />
      </div>)}</div>}
    </section><aside className="create-panel"><p className="eyebrow">UUS ALGUS</p><h2>Loo projekt</h2><p className="muted">Anna ideele nimi. Kõike ei pea veel teadma.</p><CreateProject /></aside></div>
    <footer className="page-footer">AI suunab protsessi. Sina otsustad.</footer>
  </main>;
}
