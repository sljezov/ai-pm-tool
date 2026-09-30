import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { projectIdSchema } from "@/lib/validation/projects";
import { backlogCommandSchema, BacklogError } from "@/lib/validation/backlog";
import { checkCriterion, mockupElementIds, parseCriterionReferences } from "@/domain/criteria/validation";
import { calculateReadiness } from "@/domain/readiness/readiness";
import { appendMockup } from "@/services/mockups/service";
import { restoreBacklogSnapshot } from "@/services/undo/service";

export const storyInclude = { criteria: { orderBy: { position: "asc" as const } }, openQuestions: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] }, mockupVersions: { orderBy: { version: "desc" as const } } };
export async function backlogSnapshot(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId } });
  if (!project) throw new BacklogError("Projekti ei leitud.", 404);
  return { selectedStoryId: project.selectedStoryId, mvpBoundaryAfterStoryId: project.mvpBoundaryAfterStoryId,
    stories: await tx.story.findMany({ where: { projectId }, orderBy: [{ position: "asc" }, { id: "asc" }], include: storyInclude }) };
}
export type BacklogSnapshot = Awaited<ReturnType<typeof backlogSnapshot>>;
export async function recordBacklogChange(tx: Prisma.TransactionClient, projectId: string, eventType: string, entityId: string, before: BacklogSnapshot) {
  const latest = await tx.changeEvent.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
  await tx.changeEvent.create({ data: { projectId, eventType, entityType: "backlog", entityId,
    beforeSnapshotJson: JSON.stringify(before), afterSnapshotJson: JSON.stringify(await backlogSnapshot(tx, projectId)),
    createdAt: new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1)) } });
}
export function storyService(client: PrismaClient) {
  async function get(projectId: string) {
    projectIdSchema.parse(projectId);
    const snapshot = await backlogSnapshot(client, projectId);
    const latest = await client.changeEvent.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return { ...snapshot, stories: snapshot.stories.filter(story => !story.archivedAt).map(story => {
      const ids = mockupElementIds(story.mockupVersions[0]?.structureJson);
      return { ...story, criteria: story.criteria.map(criterion => {
        const refs = parseCriterionReferences(criterion.mockupElementIdsJson);
        return { ...criterion, mockupElementIds: refs ?? [], check: refs ? checkCriterion(criterion.text, refs, ids) : { status: "fail" as const, messages: [{ code: "invalid_references", message: "Mockup-viited on vigased. Salvesta parandatud viited." }] } };
      }), readiness: calculateReadiness(story) };
    }), canUndo: !!latest && !latest.undoneAt };
  }
  return { get, async mutate(projectId: string, input: unknown) {
    projectIdSchema.parse(projectId);
    const command = backlogCommandSchema.parse(input);
    await client.$transaction(async tx => {
      const before = await backlogSnapshot(tx, projectId);
      const active = before.stories.filter(story => !story.archivedAt);
      const story = "storyId" in command && command.storyId ? active.find(item => item.id === command.storyId) : undefined;
      if ("storyId" in command && command.storyId && !story) throw new BacklogError("Selle projekti kasutajalugu ei leitud.", 404);
      if (command.type === "undo") {
        const latest = await tx.changeEvent.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
        if (!latest || latest.undoneAt) throw new BacklogError("Viimast muudatust ei saa tagasi võtta.", 409);
        await restoreBacklogSnapshot(tx, projectId, JSON.parse(latest.beforeSnapshotJson));
        await tx.changeEvent.update({ where: { id: latest.id }, data: { undoneAt: new Date() } });
        return;
      }
      if (command.type === "select") {
        await tx.project.update({ where: { id: projectId }, data: { selectedStoryId: command.storyId } });
        return; // Navigation is not a domain mutation and must not replace the undo target.
      }
      let changedStoryId: string | undefined;
      if (command.type === "create_story") {
        const { type: _type, ...data } = command;
        void _type;
        if (data.status === "ready_for_development") {
          const readiness = calculateReadiness({ ...data, criteria: [], openQuestions: [], mockupVersions: [] });
          throw new BacklogError("Lugu ei ole veel arenduseks valmis.", 422, readiness.issues);
        }
        const created = await tx.story.create({ data: { ...data, projectId, position: active.length } });
        changedStoryId = created.id;
        await tx.project.update({ where: { id: projectId }, data: { selectedStoryId: created.id } });
      } else if (command.type === "update_story" && story) {
        const { type: _type, storyId: _id, ...data } = command; void _type; void _id;
        if (data.status === "ready_for_development") {
          const readiness = calculateReadiness({ ...story, ...data });
          if (!readiness.ready) throw new BacklogError("Lugu ei ole veel arenduseks valmis.", 422, readiness.issues);
        }
        await tx.story.update({ where: { id: story.id }, data }); changedStoryId = story.id;
      } else if (command.type === "archive_story" && story) {
        await tx.story.update({ where: { id: story.id }, data: { archivedAt: new Date() } }); changedStoryId = story.id;
        await tx.project.update({ where: { id: projectId }, data: {
          ...(before.selectedStoryId === story.id ? { selectedStoryId: null } : {}),
          ...(before.mvpBoundaryAfterStoryId === story.id ? { mvpBoundaryAfterStoryId: null } : {}),
        } });
        for (const [position, item] of active.filter(item => item.id !== story.id).entries()) await tx.story.update({ where: { id: item.id }, data: { position } });
      } else if (command.type === "reorder") {
        if (command.storyIds.length !== active.length || new Set(command.storyIds).size !== active.length || command.storyIds.some(id => !active.some(story => story.id === id))) throw new BacklogError("Järjestus peab sisaldama iga selle projekti aktiivset lugu täpselt ühe korra.");
        for (const [position, id] of command.storyIds.entries()) await tx.story.update({ where: { id }, data: { position } });
      } else if (command.type === "boundary") {
        await tx.project.update({ where: { id: projectId }, data: { mvpBoundaryAfterStoryId: command.storyId } });
      } else if (story && ["create_criterion", "update_criterion", "delete_criterion"].includes(command.type)) {
        if ("criterionId" in command && !story.criteria.some(item => item.id === command.criterionId)) throw new BacklogError("Kriteeriumi ei leitud sellest loost.", 404);
        if (command.type === "delete_criterion") {
          await tx.acceptanceCriterion.delete({ where: { id: command.criterionId } });
          for (const [position, item] of story.criteria.filter(item => item.id !== command.criterionId).entries()) await tx.acceptanceCriterion.update({ where: { id: item.id }, data: { position } });
        } else if (command.type === "create_criterion" || command.type === "update_criterion") {
          const check = checkCriterion(command.text, command.mockupElementIds, mockupElementIds(story.mockupVersions[0]?.structureJson));
          const data = { text: command.text, mockupElementIdsJson: JSON.stringify(command.mockupElementIds), validationStatus: check.status, validationMessagesJson: JSON.stringify(check.messages) };
          if (command.type === "create_criterion") await tx.acceptanceCriterion.create({ data: { ...data, storyId: story.id, position: story.criteria.length } });
          else await tx.acceptanceCriterion.update({ where: { id: command.criterionId }, data });
        }
        changedStoryId = story.id;
      } else if (story && (command.type === "save_mockup" || command.type === "restore_mockup")) {
        const saved = command.type === "restore_mockup" ? story.mockupVersions.find(item => item.id === command.mockupVersionId) : undefined;
        if (command.type === "restore_mockup" && !saved) throw new BacklogError("Mockup-versiooni ei leitud sellest loost.", 404);
        await appendMockup(tx, story.id, command.type === "save_mockup" ? command.name : saved!.name, command.type === "save_mockup" ? command.document : JSON.parse(saved!.structureJson));
        changedStoryId = story.id;
      } else if (story && ["create_question", "update_question", "delete_question"].includes(command.type)) {
        if ("questionId" in command && !story.openQuestions.some(item => item.id === command.questionId)) throw new BacklogError("Küsimust ei leitud sellest loost.", 404);
        if (command.type === "create_question") await tx.openQuestion.create({ data: { storyId: story.id, text: command.text } });
        else if (command.type === "delete_question") await tx.openQuestion.delete({ where: { id: command.questionId } });
        else if (command.type === "update_question") {
          const current = story.openQuestions.find(item => item.id === command.questionId)!;
          await tx.openQuestion.update({ where: { id: command.questionId }, data: { text: command.text, resolvedAt: command.resolved ? current.resolvedAt ?? new Date() : null } });
        }
        changedStoryId = story.id;
      }
      if (changedStoryId) {
        const changed = await tx.story.findUniqueOrThrow({ where: { id: changedStoryId }, include: storyInclude });
        const invalid = changed.status === "ready_for_development" && !calculateReadiness(changed).ready;
        await tx.story.update({ where: { id: changedStoryId }, data: { ...(command.type !== "create_story" ? { version: { increment: 1 } } : {}), ...(invalid ? { status: "needs_clarification" } : {}) } });
      }
      await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
      await recordBacklogChange(tx, projectId, command.type, changedStoryId ?? projectId, before);
    });
    return get(projectId);
  } };
}
