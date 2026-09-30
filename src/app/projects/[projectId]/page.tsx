import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { projectService } from "@/services/projects/service";
import { storyService } from "@/services/stories/service";
import { Workspace } from "@/components/layout/workspace";

export const dynamic = "force-dynamic";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const project = await projectService(db).get((await params).projectId);
  if (!project) notFound();
  return <Workspace backlog={JSON.parse(JSON.stringify(await storyService(db).get(project.id)))} project={{ id: project.id, name: project.name, description: project.description, currentStage: project.currentStage, recommendedNextStage: project.recommendedNextStage, storyCount: project._count.stories }} />;
}
