import { z } from "zod";
import { mockupDocumentSchema } from "@/domain/mockup/document";
const id = z.string().min(1).max(100);
const story = { role: z.string().trim().max(200), action: z.string().trim().max(1000), benefit: z.string().trim().max(1000), status: z.enum(["idea", "needs_clarification", "reviewed", "ready_for_development"]), size: z.enum(["S", "M", "L"]).nullable(), requiresMockup: z.boolean() };
const criterion = { text: z.string().trim().max(2000), mockupElementIds: z.array(id).max(100).default([]) };
export const backlogCommandSchema = z.discriminatedUnion("type", [
 z.object({ type: z.literal("create_story"), ...story }).strict(),
 z.object({ type: z.literal("update_story"), storyId: id, ...story }).strict(),
 z.object({ type: z.literal("archive_story"), storyId: id }).strict(),
 z.object({ type: z.literal("reorder"), storyIds: z.array(id).max(10000) }).strict(),
 z.object({ type: z.literal("select"), storyId: id.nullable() }).strict(),
 z.object({ type: z.literal("boundary"), storyId: id.nullable() }).strict(),
 z.object({ type: z.literal("create_criterion"), storyId: id, ...criterion }).strict(),
 z.object({ type: z.literal("update_criterion"), storyId: id, criterionId: id, ...criterion }).strict(),
 z.object({ type: z.literal("delete_criterion"), storyId: id, criterionId: id }).strict(),
 z.object({ type: z.literal("create_question"), storyId: id, text: z.string().trim().min(1).max(2000) }).strict(),
 z.object({ type: z.literal("update_question"), storyId: id, questionId: id, text: z.string().trim().min(1).max(2000), resolved: z.boolean() }).strict(),
 z.object({ type: z.literal("delete_question"), storyId: id, questionId: id }).strict(),
 z.object({ type: z.literal("save_mockup"), storyId: id, name: z.string().trim().min(1).max(200), document: mockupDocumentSchema }).strict(),
 z.object({ type: z.literal("restore_mockup"), storyId: id, mockupVersionId: id }).strict(),
 z.object({ type: z.literal("undo") }).strict(),
]);
export class BacklogError extends Error {
 constructor(message: string, public status = 400, public issues: unknown[] = []) { super(message); }
}
