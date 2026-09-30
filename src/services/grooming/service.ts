import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { groomingOperationSchema, type GroomingOperation } from "@/domain/grooming/contracts";
import { mockupDocumentSchema, parseMockup, type MockupDocument, type MockupElement } from "@/domain/mockup/document";
import { checkCriterion, mockupElementIds, parseCriterionReferences } from "@/domain/criteria/validation";
import { BacklogError } from "@/lib/validation/backlog";
import { backlogSnapshot, recordBacklogChange, type BacklogSnapshot } from "@/services/stories/service";
import { appendMockup } from "@/services/mockups/service";
import { calculateReadiness } from "@/domain/readiness/readiness";

export function validateGrooming(operation: GroomingOperation, stories: BacklogSnapshot["stories"]) {
  const sources = operation.sources.map(source => stories.find(story => story.id === source.storyId && !story.archivedAt));
  if (new Set(operation.sources.map(source => source.storyId)).size !== sources.length || sources.some((story, index) => !story || story.version !== operation.sources[index].version)) throw new BacklogError("Lood on pärast eelvaate loomist muutunud. Koosta ülevaatus uuesti.", 409);
  const resolved = sources as BacklogSnapshot["stories"];
  const ids = resolved.flatMap(story => story.criteria.map(item => item.id));
  const assigned = operation.type === "repair_story" ? operation.criteria.map(item => item.criterionId) : operation.results.flatMap(item => item.criterionIds);
  if (assigned.length !== ids.length || new Set(assigned).size !== assigned.length || ids.some(id => !assigned.includes(id))) throw new BacklogError("Iga lähtekriteerium tuleb määrata täpselt ühele tulemusele.", 422);
  if (operation.type === "repair_story") {
    if (!operation.mockup && resolved[0].mockupVersions.length) throw new BacklogError("Ülevaatus ei saa olemasolevat mockupit kustutada.", 422);
    const available = mockupElementIds(JSON.stringify(operation.mockup));
    if (operation.criteria.some(item => checkCriterion(item.text, item.mockupElementIds, available).status === "fail")) throw new BacklogError("Paranduse kriteeriumid või mockup-viited on vigased.", 422);
    if (resolved[0].requiresMockup && !available.length) throw new BacklogError("Lugu vajab mittetühja mockup'i.", 422);
  }
  return resolved;
}

// Preserve complete safe trees; namespace only when combining multiple screens.
export function replacementContent(sources: BacklogSnapshot["stories"], criterionIds: string[]) {
  const documents = sources.map(story => parseMockup(story.mockupVersions[0]?.structureJson));
  const remap = (elements: MockupElement[], prefix: string, map: Map<string, string>): MockupElement[] => elements.map(item => {
    const id = `${prefix}${map.size}`; map.set(item.id, id);
    return { ...item, id, ...(item.children ? { children: remap(item.children, prefix, map) } : {}) };
  });
  const maps = sources.map(() => new Map<string, string>());
  const elements = documents.flatMap((document, index) => document ? sources.length === 1 ? document.elements : remap(document.elements, `s${index}-`, maps[index]) : []);
  const mockup: MockupDocument | null = sources.length === 1 ? documents[0] : documents.some(Boolean) ? mockupDocumentSchema.parse({ schemaVersion: 1, screenName: "Ühendatud vaated", elements }) : null;
  const available = mockupElementIds(JSON.stringify(mockup));
  const criteria = criterionIds.map(id => {
    const index = sources.findIndex(story => story.criteria.some(item => item.id === id));
    const original = sources[index].criteria.find(item => item.id === id)!;
    const refs = parseCriterionReferences(original.mockupElementIdsJson);
    if (!refs) throw new BacklogError("Paranda enne jagamist või ühendamist vigased mockup-viited.", 422);
    const references = sources.length === 1 ? refs : refs.map(ref => maps[index].get(ref) ?? ref);
    const check = checkCriterion(original.text, references, available);
    if (check.status === "fail") throw new BacklogError("Paranda enne jagamist või ühendamist vigased kriteeriumid.", 422);
    return { text: original.text, mockupElementIds: references, origin: original.origin, check };
  });
  // Identical wording becomes one criterion; retain all of its valid UI mappings.
  const unique = new Map<string, typeof criteria[number]>();
  for (const criterion of criteria) {
    const key = criterion.text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const previous = unique.get(key);
    if (previous) { previous.mockupElementIds = [...new Set([...previous.mockupElementIds, ...criterion.mockupElementIds])]; previous.check = checkCriterion(previous.text, previous.mockupElementIds, available); }
    else unique.set(key, criterion);
  }
  return { mockup, criteria: [...unique.values()] };
}

export async function applyGrooming(tx: Prisma.TransactionClient, projectId: string, raw: unknown, origin: "manual" | "ai" = "manual") {
  const operation = groomingOperationSchema.parse(raw);
  const before = await backlogSnapshot(tx, projectId);
  const sources = validateGrooming(operation, before.stories);
  if (operation.type === "repair_story") {
    const story = sources[0];
    if (JSON.stringify(parseMockup(story.mockupVersions[0]?.structureJson)) !== JSON.stringify(operation.mockup) && operation.mockup) await appendMockup(tx, story.id, operation.mockup.screenName, operation.mockup, origin);
    const available = mockupElementIds(JSON.stringify(operation.mockup));
    for (const criterion of operation.criteria) {
      const check = checkCriterion(criterion.text, criterion.mockupElementIds, available);
      await tx.acceptanceCriterion.update({ where: { id: criterion.criterionId }, data: { text: criterion.text, mockupElementIdsJson: JSON.stringify(criterion.mockupElementIds), validationStatus: check.status, validationMessagesJson: JSON.stringify(check.messages) } });
    }
    const next = { ...story, ...operation.story, criteria: operation.criteria.map(item => ({ text: item.text, mockupElementIdsJson: JSON.stringify(item.mockupElementIds) })), mockupVersions: operation.mockup ? [{ structureJson: JSON.stringify(operation.mockup) }] : [] };
    await tx.story.update({ where: { id: story.id }, data: { ...operation.story, version: { increment: 1 }, ...(story.status === "ready_for_development" && !calculateReadiness(next).ready ? { status: "needs_clarification" } : {}) } });
  } else {
    const contents = operation.results.map(result => replacementContent(sources, result.criterionIds));
    const created: string[] = [];
    for (const [index, result] of operation.results.entries()) {
      const story = await tx.story.create({ data: { projectId, role: result.role, action: result.action, benefit: result.benefit, position: 0, status: "needs_clarification", size: operation.type === "split_story" ? "S" : null, requiresMockup: sources.some(item => item.requiresMockup), origin } });
      created.push(story.id);
      const content = contents[index];
      if (content.mockup) await appendMockup(tx, story.id, content.mockup.screenName, content.mockup, origin);
      for (const [position, criterion] of content.criteria.entries()) await tx.acceptanceCriterion.create({ data: { storyId: story.id, position, text: criterion.text, origin: criterion.origin, mockupElementIdsJson: JSON.stringify(criterion.mockupElementIds), validationStatus: criterion.check.status, validationMessagesJson: JSON.stringify(criterion.check.messages) } });
      // Questions remain visible until reviewed; source records and history remain archived.
      for (const source of sources) for (const question of source.openQuestions) await tx.openQuestion.create({ data: { storyId: story.id, text: question.text, resolvedAt: question.resolvedAt } });
    }
    const sourceIds = sources.map(item => item.id);
    await tx.story.updateMany({ where: { projectId, id: { in: sourceIds } }, data: { archivedAt: new Date(), version: { increment: 1 } } });
    const active = before.stories.filter(item => !item.archivedAt);
    const insertAt = active.findIndex(item => sourceIds.includes(item.id));
    const order = active.flatMap((story, index) => [...(index === insertAt ? created : []), ...(!sourceIds.includes(story.id) ? [story.id] : [])]);
    for (const [position, id] of order.entries()) if (active.find(item => item.id === id)?.position !== position) await tx.story.update({ where: { id }, data: { position } });
    await tx.project.update({ where: { id: projectId }, data: { selectedStoryId: sourceIds.includes(before.selectedStoryId ?? "") ? created[0] : before.selectedStoryId, mvpBoundaryAfterStoryId: sourceIds.includes(before.mvpBoundaryAfterStoryId ?? "") ? null : before.mvpBoundaryAfterStoryId } });
  }
  await tx.project.update({ where: { id: projectId }, data: { currentStage: "grooming", recommendedNextStage: "grooming", updatedAt: new Date() } });
  await recordBacklogChange(tx, projectId, operation.type, sources[0].id, before);
}
