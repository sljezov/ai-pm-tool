import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { priorityPayloadSchema, proposalCommandSchema, rolePayloadSchema, storyPayloadSchema } from "@/domain/ai/contracts";
import { projectIdSchema } from "@/lib/validation/projects";
import { BacklogError } from "@/lib/validation/backlog";
import { backlogSnapshot, recordBacklogChange } from "@/services/stories/service";

async function recordEvent(tx: Prisma.TransactionClient, projectId: string, eventType: string, entityType: string, entityId: string, before: unknown, after: unknown) {
  const latest = await tx.changeEvent.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
  await tx.changeEvent.create({ data: { projectId, eventType, entityType, entityId, beforeSnapshotJson: JSON.stringify(before), afterSnapshotJson: JSON.stringify(after), createdAt: new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1)) } });
}

export function proposalWorkflowService(client: PrismaClient) {
  return {
    async confirm(projectIdRaw: string, raw: unknown) {
      const projectId = projectIdSchema.parse(projectIdRaw);
      const command = proposalCommandSchema.parse(raw);
      await client.$transaction(async tx => {
        const proposal = await tx.proposal.findFirst({ where: { id: command.proposalId, projectId } });
        if (!proposal) throw new BacklogError("Ettepanekut ei leitud.", 404);
        if (proposal.status === "applied") return;
        if (proposal.status !== "pending") throw new BacklogError("Ettepanek pole enam aktiivne.", 409);

        if (command.kind === "confirm_roles") {
          if (proposal.type !== "roles") throw new BacklogError("Vale ettepaneku tüüp.", 400);
          const payload = rolePayloadSchema.parse(JSON.parse(proposal.afterSnapshotJson));
          const offered = new Set(payload.roles.map(role => role.temporaryId));
          if (new Set(command.roles.map(role => role.temporaryId)).size !== command.roles.length || command.roles.some(role => !offered.has(role.temporaryId)) || !command.roles.some(role => role.temporaryId === command.primaryTemporaryId) || new Set(command.roles.map(role => role.name.toLocaleLowerCase())).size !== command.roles.length) throw new BacklogError("Rollide valik või peamine roll on vigane.", 400);
          const claim = await tx.proposal.updateMany({ where: { id: proposal.id, projectId, status: "pending" }, data: { status: "applied", resolvedAt: new Date() } });
          if (!claim.count) return;
          const before = await tx.projectRole.findMany({ where: { projectId }, orderBy: { position: "asc" } });
          await tx.projectRole.deleteMany({ where: { projectId } });
          for (const [position, role] of command.roles.entries()) await tx.projectRole.create({ data: { projectId, name: role.name, isPrimary: role.temporaryId === command.primaryTemporaryId, origin: "ai", position } });
          await tx.proposal.updateMany({ where: { projectId, type: { in: ["stories", "priority"] }, status: "pending" }, data: { status: "superseded", resolvedAt: new Date() } });
          await tx.project.update({ where: { id: projectId }, data: { currentStage: "stories", recommendedNextStage: "stories" } });
          const after = await tx.projectRole.findMany({ where: { projectId }, orderBy: { position: "asc" } });
          await recordEvent(tx, projectId, "apply_role_proposal", "roles", proposal.id, before, after);
          return;
        }

        if (command.kind === "confirm_stories") {
          if (proposal.type !== "stories") throw new BacklogError("Vale ettepaneku tüüp.", 400);
          const payload = storyPayloadSchema.parse(JSON.parse(proposal.afterSnapshotJson));
          const selected = new Set(command.selectedTemporaryIds);
          if (selected.size !== command.selectedTemporaryIds.length || [...selected].some(id => !payload.stories.some(story => story.temporaryId === id))) throw new BacklogError("Lugude valik on vigane.", 400);
          const primary = await tx.projectRole.findFirst({ where: { projectId, isPrimary: true } });
          if (!primary || payload.primaryRole.toLocaleLowerCase() !== primary.name.toLocaleLowerCase() || payload.stories.some(story => story.role.toLocaleLowerCase() !== primary.name.toLocaleLowerCase())) throw new BacklogError("Rollid on pärast ettepaneku loomist muutunud. Genereeri lood uuesti.", 409);
          const claim = await tx.proposal.updateMany({ where: { id: proposal.id, projectId, status: "pending" }, data: { status: "applied", resolvedAt: new Date() } });
          if (!claim.count) return;
          const before = await backlogSnapshot(tx, projectId);
          const activeCount = before.stories.filter(story => !story.archivedAt).length;
          const stories = payload.stories.filter(story => selected.has(story.temporaryId)).sort((a, b) => a.happyPathOrder - b.happyPathOrder);
          for (const [index, story] of stories.entries()) await tx.story.create({ data: { projectId, role: story.role, action: story.action, benefit: story.benefit, position: activeCount + index, origin: "ai", status: "idea", requiresMockup: true } });
          await tx.proposal.updateMany({ where: { projectId, type: "priority", status: "pending" }, data: { status: "superseded", resolvedAt: new Date() } });
          await tx.project.update({ where: { id: projectId }, data: { currentStage: "priorities", recommendedNextStage: "priorities", updatedAt: new Date() } });
          await recordBacklogChange(tx, projectId, "apply_story_proposal", proposal.id, before);
          return;
        }

        if (proposal.type !== "priority") throw new BacklogError("Vale ettepaneku tüüp.", 400);
        priorityPayloadSchema.parse(JSON.parse(proposal.afterSnapshotJson));
        const before = await backlogSnapshot(tx, projectId);
        const active = before.stories.filter(story => !story.archivedAt);
        const chosen = active.find(story => story.id === command.storyId);
        if (!chosen) throw new BacklogError("Valitud lugu ei kuulu sellesse projekti.", 400);
        const claim = await tx.proposal.updateMany({ where: { id: proposal.id, projectId, status: "pending" }, data: { status: "applied", resolvedAt: new Date() } });
        if (!claim.count) return;
        const ordered = [chosen, ...active.filter(story => story.id !== chosen.id)];
        for (const [position, story] of ordered.entries()) await tx.story.update({ where: { id: story.id }, data: { position } });
        await tx.project.update({ where: { id: projectId }, data: { selectedStoryId: chosen.id, currentStage: "prototype", recommendedNextStage: "prototype", updatedAt: new Date() } });
        await recordBacklogChange(tx, projectId, "apply_priority_proposal", proposal.id, before);
      });
    },
  };
}
