import { z } from "zod";
const text = z.string().trim().min(1).max(1000);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const option = z.strictObject({ id, label: text });
const question = z.strictObject({ id, text, selectionMode: z.enum(["single", "multiple"]), options: z.array(option).min(2).max(6) }).superRefine((value, ctx) => {
  if (new Set(value.options.map(o => o.id)).size !== value.options.length) ctx.addIssue({ code: "custom", message: "Option IDs must be unique" });
});
const actions = z.array(z.strictObject({ id, label: text, action: z.enum(["clarify_idea", "propose_roles", "write_text"]) })).min(1).max(4);
const envelope = { message: text, nextActions: actions };
export const clarificationSchema = z.strictObject({ ...envelope, payload: z.strictObject({ questions: z.array(question).min(1).max(3) }) }).superRefine((value, ctx) => {
  if (new Set(value.payload.questions.map(q => q.id)).size !== value.payload.questions.length) ctx.addIssue({ code: "custom", message: "Question IDs must be unique" });
});
export const roleProposalSchema = z.strictObject({ ...envelope, payload: z.strictObject({ roles: z.array(z.strictObject({ temporaryId: id, name: text, rationale: text })).min(1).max(8) }) }).superRefine((value, ctx) => {
  const roles = value.payload.roles;
  if (new Set(roles.map(r => r.temporaryId)).size !== roles.length || new Set(roles.map(r => r.name.toLocaleLowerCase())).size !== roles.length) ctx.addIssue({ code: "custom", message: "Roles must be unique" });
});
export type GuidedResponse = z.infer<typeof clarificationSchema> | z.infer<typeof roleProposalSchema>;
export type GuidedTask = "clarify_idea" | "propose_roles";
export type AiTask = GuidedTask | "propose_stories" | "recommend_priority" | "propose_prototype" | "propose_refinement" | "review_backlog";
export const taskSchemas = { clarify_idea: clarificationSchema, propose_roles: roleProposalSchema };
export const conversationInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), text: z.string().trim().min(1).max(4000), task: z.enum(["clarify_idea", "propose_roles"]).optional() }),
  z.strictObject({ kind: z.literal("answer"), messageId: z.string().min(1).max(100), questionId: id, optionIds: z.array(id).max(6), other: z.string().trim().min(1).max(1000).optional(), skip: z.boolean() }),
  z.strictObject({ kind: z.literal("retry"), messageId: z.string().min(1).max(100) }),
]);
export type ConversationInput = z.infer<typeof conversationInputSchema>;
export type ConversationEntry = { id: string; role: "user" | "assistant" | "system_event"; messageType: string; content: string; createdAt: string; response: GuidedResponse | null; task: GuidedTask | null; answeredQuestionIds: string[]; requestStatus: "processing" | "complete" | "failed" | null };
export type ConversationData = { mode: "fixture" | "live" | "unavailable"; messages: ConversationEntry[] };
