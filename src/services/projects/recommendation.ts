import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { recommendedStage } from "@/domain/stages/recommendation";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function calculateRecommendedStage(client: DbClient, projectId: string) {
  const project = await client.project.findUnique({
    where: { id: projectId },
    select: {
      selectedStoryId: true,
      _count: { select: { roles: true, stories: { where: { archivedAt: null } } } },
      stories: { where: { archivedAt: null }, select: { id: true, version: true, _count: { select: { criteria: true, mockupVersions: true } } } },
      proposals: {
        where: { status: { in: ["pending", "applied"] }, type: { in: ["roles", "refinement", "grooming"] } },
        select: { type: true, status: true, targetStoryId: true, baseStoryVersion: true },
      },
    },
  });
  if (!project) return null;
  const selected = project.stories.find(story => story.id === project.selectedStoryId) ?? null;
  return recommendedStage({
    roleCount: project._count.roles,
    storyCount: project._count.stories,
    selectedStory: selected ? { criterionCount: selected._count.criteria, hasMockup: selected._count.mockupVersions > 0 } : null,
    pendingProposalTypes: project.proposals.filter(item => item.status === "pending").map(item => item.type),
    appliedRefinement: project.proposals.some(item => item.status === "applied" && item.type === "refinement" && item.targetStoryId === project.selectedStoryId && item.baseStoryVersion !== null && !!selected && selected.version > item.baseStoryVersion),
    appliedGrooming: project.proposals.some(item => item.status === "applied" && item.type === "grooming"),
  });
}

export async function syncRecommendedStage(client: DbClient, projectId: string) {
  const stage = await calculateRecommendedStage(client, projectId);
  if (stage) await client.project.updateMany({ where: { id: projectId, recommendedNextStage: { not: stage } }, data: { recommendedNextStage: stage } });
  return stage;
}
