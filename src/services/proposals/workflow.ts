import "server-only";
import { findingSchema } from "@/domain/grooming/contracts";
import { applyGrooming } from "@/services/grooming/service";
import type { PrismaClient } from "@/generated/prisma/client";
import { priorityPayloadSchema, proposalCommandSchema, rolePayloadSchema, storyPayloadSchema, prototypePayloadSchema, refinementPayloadSchema } from "@/domain/ai/contracts";
import { refinementErrors } from "@/domain/ai/refinement";
import { projectIdSchema } from "@/lib/validation/projects";
import { BacklogError } from "@/lib/validation/backlog";
import { backlogSnapshot, recordBacklogChange, storyInclude } from "@/services/stories/service";
import { checkCriterion, mockupElementIds } from "@/domain/criteria/validation";
import { calculateReadiness } from "@/domain/readiness/readiness";
import { appendMockup } from "@/services/mockups/service";

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

        if (command.kind === "confirm_grooming" || command.kind === "ignore_grooming") {
          if (proposal.type !== "grooming") throw new BacklogError("Vale ettepaneku tüüp.", 400);
          if (command.kind === "ignore_grooming") {
            await tx.proposal.updateMany({ where: { id: proposal.id, status: "pending" }, data: { status: "rejected", resolvedAt: new Date() } }); return;
          }
          const finding = findingSchema.parse(JSON.parse(proposal.afterSnapshotJson));
          if (command.operation.type !== finding.operation.type || JSON.stringify(command.operation.sources) !== JSON.stringify(finding.operation.sources)) throw new BacklogError("Muuta saab ainult selle leiu tulemust, mitte lähteandmeid.", 400);
          const claim = await tx.proposal.updateMany({ where: { id: proposal.id, status: "pending" }, data: { status: "applied", resolvedAt: new Date() } });
          if (!claim.count) return;
          await applyGrooming(tx, projectId, command.operation, "ai"); return;
        }
        if (command.kind === "reject_prototype" || command.kind === "reject_refinement") {
          if (proposal.type !== (command.kind === "reject_refinement" ? "refinement" : "prototype")) throw new BacklogError("Vale ettepaneku tüüp.", 400);
          await tx.proposal.updateMany({ where: { id: proposal.id, projectId, status: "pending" }, data: { status: "rejected", resolvedAt: new Date() } });
          return;
        }
        if (command.kind === "confirm_refinement") {
          if (proposal.type !== "refinement") throw new BacklogError("Vale ettepaneku tüüp.", 400);
          const payload = refinementPayloadSchema.parse(JSON.parse(proposal.afterSnapshotJson));
          if (!proposal.targetStoryId || payload.targetStoryId !== proposal.targetStoryId || payload.baseStoryVersion !== proposal.baseStoryVersion) throw new BacklogError("Ettepaneku loo piirang on vigane.", 400);
          const story = await tx.story.findFirst({ where: { id: proposal.targetStoryId, projectId, archivedAt: null }, include: storyInclude });
          if (!story) throw new BacklogError("Ettepaneku lugu ei leitud.", 404);
          if (story.version !== proposal.baseStoryVersion) throw new BacklogError("Lugu on pärast ettepaneku loomist muutunud. Koosta täpsustus uuesti.", 409);
          for (const area of ["story", "criteria", "mockup"] as const) if (command.edits[area] && !payload[area]) throw new BacklogError("Muuta saab ainult ettepanekus näidatud alasid.", 400);
          const edited = { ...payload, ...(payload.story ? { story: { ...payload.story, after: command.edits.story ?? payload.story.after } } : {}), ...(payload.criteria ? { criteria: { ...payload.criteria, after: command.edits.criteria ?? payload.criteria.after } } : {}), ...(payload.mockup ? { mockup: { ...payload.mockup, after: command.edits.mockup ?? payload.mockup.after } } : {}) };
          const siblings = await tx.story.findMany({ where: { projectId, archivedAt: null }, select: { id: true } });
          const current = { id: story.id, version: story.version, role: story.role, action: story.action, benefit: story.benefit, criteria: story.criteria.map(item => ({ text: item.text, mockupElementIds: JSON.parse(item.mockupElementIdsJson) as string[] })), mockup: story.mockupVersions[0] ? JSON.parse(story.mockupVersions[0].structureJson) : null };
          if (refinementErrors(edited, current, siblings.map(item => item.id)).length) throw new BacklogError("Täpsustuse lähteandmed või kriteeriumide mockup-viited on vigased.", 422);
          const before = await backlogSnapshot(tx, projectId);
          const claim = await tx.proposal.updateMany({ where: { id: proposal.id, projectId, status: "pending" }, data: { status: "applied", resolvedAt: new Date() } });
          if (!claim.count) return;
          if (edited.mockup) await appendMockup(tx, story.id, edited.mockup.after.screenName, edited.mockup.after, "refinement");
          const ids = mockupElementIds(JSON.stringify(edited.mockup?.after ?? current.mockup));
          if (edited.criteria) {
            await tx.acceptanceCriterion.deleteMany({ where: { storyId: story.id } });
            for (const [position, criterion] of edited.criteria.after.entries()) {
              const check = checkCriterion(criterion.text, criterion.mockupElementIds, ids);
              await tx.acceptanceCriterion.create({ data: { storyId: story.id, text: criterion.text, position, origin: "ai", mockupElementIdsJson: JSON.stringify(criterion.mockupElementIds), validationStatus: check.status, validationMessagesJson: JSON.stringify(check.messages) } });
            }
          } else if (edited.mockup) {
            for (const criterion of story.criteria) {
              const check = checkCriterion(criterion.text, JSON.parse(criterion.mockupElementIdsJson), ids);
              await tx.acceptanceCriterion.update({ where: { id: criterion.id }, data: { validationStatus: check.status, validationMessagesJson: JSON.stringify(check.messages) } });
            }
          }
          await tx.story.update({ where: { id: story.id }, data: { ...(edited.story?.after ?? {}), version: { increment: 1 } } });
          const changed = await tx.story.findUniqueOrThrow({ where: { id: story.id }, include: storyInclude });
          if (changed.status === "ready_for_development" && !calculateReadiness(changed).ready) await tx.story.update({ where: { id: story.id }, data: { status: "needs_clarification" } });
          await tx.project.update({ where: { id: projectId }, data: { currentStage: "refinements", recommendedNextStage: "grooming", updatedAt: new Date() } });
          await recordBacklogChange(tx, projectId, "apply_refinement_proposal", story.id, before);
          return;
        }
        if (command.kind === "confirm_prototype") {
          if (proposal.type !== "prototype") throw new BacklogError("Vale ettepaneku tüüp.", 400);
          const payload = prototypePayloadSchema.parse(JSON.parse(proposal.afterSnapshotJson));
          if (!proposal.targetStoryId || payload.targetStoryId !== proposal.targetStoryId || payload.baseStoryVersion !== proposal.baseStoryVersion) throw new BacklogError("Ettepaneku loo piirang on vigane.", 400);
          const story = await tx.story.findFirst({ where: { id: proposal.targetStoryId, projectId, archivedAt: null }, include: storyInclude });
          if (!story) throw new BacklogError("Ettepaneku lugu ei leitud.", 404);
          if (story.version !== proposal.baseStoryVersion) throw new BacklogError("Lugu on pärast ettepaneku loomist muutunud. Genereeri prototüüp uuesti.", 409);
          const ids = mockupElementIds(JSON.stringify(payload.mockup));
          if (new Set(command.criteria.map(item => item.temporaryId)).size !== command.criteria.length || command.criteria.some(item => !payload.criteria.some(offered => offered.temporaryId === item.temporaryId) || new Set(item.mockupElementIds).size !== item.mockupElementIds.length || checkCriterion(item.text, item.mockupElementIds, ids).status === "fail")) throw new BacklogError("Paranda kriteeriumide tekst või mockup-viited enne kinnitamist.", 422);
          const before = await backlogSnapshot(tx, projectId);
          const claim = await tx.proposal.updateMany({ where: { id: proposal.id, projectId, status: "pending" }, data: { status: "applied", resolvedAt: new Date() } });
          if (!claim.count) return;
          await tx.acceptanceCriterion.deleteMany({ where: { storyId: story.id } });
          for (const [position, criterion] of command.criteria.entries()) {
            const check = checkCriterion(criterion.text, criterion.mockupElementIds, ids);
            await tx.acceptanceCriterion.create({ data: { storyId: story.id, text: criterion.text, position, origin: "ai", mockupElementIdsJson: JSON.stringify(criterion.mockupElementIds), validationStatus: check.status, validationMessagesJson: JSON.stringify(check.messages) } });
          }
          await appendMockup(tx, story.id, payload.mockup.screenName, payload.mockup, "ai");
          await tx.story.update({ where: { id: story.id }, data: { ...(command.acceptProposedStory && payload.proposedStory ? payload.proposedStory : {}), version: { increment: 1 } } });
          const changed = await tx.story.findUniqueOrThrow({ where: { id: story.id }, include: storyInclude });
          const readiness = calculateReadiness(changed);
          if (changed.status === "ready_for_development" && !readiness.ready) await tx.story.update({ where: { id: story.id }, data: { status: "needs_clarification" } });
          await tx.project.update({ where: { id: projectId }, data: { currentStage: "prototype", recommendedNextStage: "refinements", updatedAt: new Date() } });
          await recordBacklogChange(tx, projectId, "apply_prototype_proposal", story.id, before);
          return;
        }

        if (command.kind === "confirm_roles") {
          if (proposal.type !== "roles") throw new BacklogError("Vale ettepaneku tüüp.", 400);
          const payload = rolePayloadSchema.parse(JSON.parse(proposal.afterSnapshotJson));
          const offered = new Set(payload.roles.map(role => role.temporaryId));
          if (new Set(command.roles.map(role => role.temporaryId)).size !== command.roles.length || command.roles.some(role => !offered.has(role.temporaryId)) || !command.roles.some(role => role.temporaryId === command.primaryTemporaryId) || new Set(command.roles.map(role => role.name.toLocaleLowerCase())).size !== command.roles.length) throw new BacklogError("Rollide valik või peamine roll on vigane.", 400);
          const claim = await tx.proposal.updateMany({ where: { id: proposal.id, projectId, status: "pending" }, data: { status: "applied", resolvedAt: new Date() } });
          if (!claim.count) return;
          const before = await backlogSnapshot(tx, projectId);
          await tx.projectRole.deleteMany({ where: { projectId } });
          for (const [position, role] of command.roles.entries()) await tx.projectRole.create({ data: { projectId, name: role.name, isPrimary: role.temporaryId === command.primaryTemporaryId, origin: "ai", position } });
          await tx.proposal.updateMany({ where: { projectId, type: { in: ["stories", "priority"] }, status: "pending" }, data: { status: "superseded", resolvedAt: new Date() } });
          await tx.project.update({ where: { id: projectId }, data: { currentStage: "stories", recommendedNextStage: "stories" } });
          await recordBacklogChange(tx, projectId, "apply_role_proposal", proposal.id, before);
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
