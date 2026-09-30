import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { BacklogSnapshot } from "@/services/stories/service";

import { appendMockup } from "@/services/mockups/service";
import { emptyMockup } from "@/domain/mockup/document";
export async function restoreBacklogSnapshot(tx: Prisma.TransactionClient, projectId: string, snapshot: BacklogSnapshot) {
  const savedIds = snapshot.stories.map(story => story.id);
  await tx.story.updateMany({ where: { projectId, id: { notIn: savedIds } }, data: { archivedAt: new Date() } });
  for (const story of snapshot.stories) {
    const current = await tx.mockupVersion.findFirst({ where: { storyId: story.id }, orderBy: { version: "desc" } });
    const saved = story.mockupVersions[0];
    if (current?.id !== saved?.id) await appendMockup(tx, story.id, saved?.name ?? "Mockup eemaldatud", saved ? JSON.parse(saved.structureJson) : emptyMockup);
    const { criteria, openQuestions, mockupVersions: _mockups, ...fields } = story; void _mockups;
    const data = { ...fields, createdAt: new Date(fields.createdAt), updatedAt: new Date(fields.updatedAt), archivedAt: fields.archivedAt ? new Date(fields.archivedAt) : null };
    await tx.story.update({ where: { id: story.id, projectId }, data });
    await tx.acceptanceCriterion.deleteMany({ where: { storyId: story.id } });
    for (const item of criteria) await tx.acceptanceCriterion.create({ data: { ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } });
    await tx.openQuestion.deleteMany({ where: { storyId: story.id } });
    for (const item of openQuestions) await tx.openQuestion.create({ data: { ...item, createdAt: new Date(item.createdAt), resolvedAt: item.resolvedAt ? new Date(item.resolvedAt) : null } });
  }
  if (Array.isArray(snapshot.roles)) {
    await tx.projectRole.deleteMany({ where: { projectId } });
    for (const role of snapshot.roles) await tx.projectRole.create({ data: { ...role, projectId } });
  }
  await tx.project.update({ where: { id: projectId }, data: { selectedStoryId: snapshot.selectedStoryId, mvpBoundaryAfterStoryId: snapshot.mvpBoundaryAfterStoryId, ...(snapshot.currentStage ? { currentStage: snapshot.currentStage } : {}), ...(snapshot.recommendedNextStage ? { recommendedNextStage: snapshot.recommendedNextStage } : {}) } });
}
