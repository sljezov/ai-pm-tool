import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { BacklogSnapshot } from "@/services/stories/service";

// Full WP-02 snapshot: archived stories, child records, order and project pointers.
// Mockup history is deliberately untouched: WP-02 never changes it, and versions are append-only.
export async function restoreBacklogSnapshot(tx: Prisma.TransactionClient, projectId: string, snapshot: BacklogSnapshot) {
  const savedIds = snapshot.stories.map(story => story.id);
  await tx.story.updateMany({ where: { projectId, id: { notIn: savedIds } }, data: { archivedAt: new Date() } });
  for (const story of snapshot.stories) {
    const { criteria, openQuestions, mockupVersions: _mockups, ...fields } = story; void _mockups;
    const data = { ...fields, createdAt: new Date(fields.createdAt), updatedAt: new Date(fields.updatedAt), archivedAt: fields.archivedAt ? new Date(fields.archivedAt) : null };
    await tx.story.update({ where: { id: story.id, projectId }, data });
    await tx.acceptanceCriterion.deleteMany({ where: { storyId: story.id } });
    for (const item of criteria) await tx.acceptanceCriterion.create({ data: { ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) } });
    await tx.openQuestion.deleteMany({ where: { storyId: story.id } });
    for (const item of openQuestions) await tx.openQuestion.create({ data: { ...item, createdAt: new Date(item.createdAt), resolvedAt: item.resolvedAt ? new Date(item.resolvedAt) : null } });
  }
  await tx.project.update({ where: { id: projectId }, data: { selectedStoryId: snapshot.selectedStoryId, mvpBoundaryAfterStoryId: snapshot.mvpBoundaryAfterStoryId } });
}
