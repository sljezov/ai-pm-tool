import { z } from "zod";
import { mockupDocumentSchema } from "@/domain/mockup/document";
const id = z.string().min(1).max(100);
export const wordingSchema = z.strictObject({ role: z.string().trim().min(1).max(200), action: z.string().trim().min(1).max(1000), benefit: z.string().trim().min(1).max(1000) });
const source = z.strictObject({ storyId: id, version: z.number().int().min(1) });
const result = wordingSchema.extend({ criterionIds: z.array(id).max(200) });
export const replacementSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("split_story"), sources: z.array(source).length(1), results: z.array(result).min(2).max(8) }),
  z.strictObject({ type: z.literal("merge_stories"), sources: z.array(source).min(2).max(8), results: z.array(result).length(1) }),
]);
export const repairSchema = z.strictObject({ type: z.literal("repair_story"), sources: z.array(source).length(1), story: wordingSchema, criteria: z.array(z.strictObject({ criterionId: id, text: z.string().trim().min(12).max(2000), mockupElementIds: z.array(id).max(200) })).max(200), mockup: mockupDocumentSchema.nullable() });
export const groomingOperationSchema = z.union([replacementSchema, repairSchema]);
export type GroomingOperation = z.infer<typeof groomingOperationSchema>;
export type Replacement = z.infer<typeof replacementSchema>;
export const findingSchema = z.strictObject({ temporaryId: id, category: z.enum(["oversized", "duplicate", "invalid_criteria", "missing_mockup", "malformed_connextra"]), explanation: z.string().trim().min(1).max(1000), operation: groomingOperationSchema }).superRefine((value, ctx) => {
  const expected = value.category === "oversized" ? "split_story" : value.category === "duplicate" ? "merge_stories" : "repair_story";
  if (value.operation.type !== expected) ctx.addIssue({ code: "custom", message: "Finding category and operation do not match" });
});
export const reviewPayloadSchema = z.strictObject({ findings: z.array(findingSchema).max(12) }).superRefine((value, ctx) => {
  if (new Set(value.findings.map(item => item.temporaryId)).size !== value.findings.length) ctx.addIssue({ code: "custom", message: "Finding IDs must be unique" });
});

export type GroomingStoryPreview = { id: string; role: string; action: string; benefit: string; version: number; criteria: Array<{ id: string; text: string }>; openQuestions: unknown[]; mockupVersions: Array<{ structureJson: string }> };
