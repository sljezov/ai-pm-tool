import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { mockupDocumentSchema } from "@/domain/mockup/document";
import { checkCriterion, mockupElementIds, parseCriterionReferences } from "@/domain/criteria/validation";

// Call only inside a project-scoped transaction after resolving the story.
export async function appendMockup(tx: Prisma.TransactionClient, storyId: string, name: string, input: unknown, source: "manual" | "ai" | "refinement" = "manual") {
  const document = mockupDocumentSchema.parse(input);
  const latest = await tx.mockupVersion.findFirst({ where: { storyId }, orderBy: { version: "desc" } });
  const structureJson = JSON.stringify(document);
  await tx.mockupVersion.create({ data: { storyId, name, structureJson, source, version: (latest?.version ?? 0) + 1 } });
  const ids = mockupElementIds(structureJson);
  for (const criterion of await tx.acceptanceCriterion.findMany({ where: { storyId } })) {
    const refs = parseCriterionReferences(criterion.mockupElementIdsJson);
    const check = refs ? checkCriterion(criterion.text, refs, ids) : { status: "fail" as const, messages: [{ code: "invalid_references", message: "Mockup-viited on vigased." }] };
    await tx.acceptanceCriterion.update({ where: { id: criterion.id }, data: { validationStatus: check.status, validationMessagesJson: JSON.stringify(check.messages) } });
  }
}
