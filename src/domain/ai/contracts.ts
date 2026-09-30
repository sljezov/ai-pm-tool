import { z } from "zod";

const text = z.string().trim().min(1).max(1000);
const shortText = z.string().trim().min(1).max(300);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const option = z.strictObject({ id, label: text });
const question = z.strictObject({ id, text, selectionMode: z.enum(["single", "multiple"]), options: z.array(option).min(2).max(6) }).superRefine((value, ctx) => {
  if (new Set(value.options.map(item => item.id)).size !== value.options.length) ctx.addIssue({ code: "custom", message: "Option IDs must be unique" });
});

export const conversationTaskSchema = z.enum(["clarify_idea", "propose_roles", "propose_stories", "recommend_priority"]);
export type ConversationTask = z.infer<typeof conversationTaskSchema>;
export type GuidedTask = ConversationTask;
const actionName = z.enum(["clarify_idea", "propose_roles", "propose_stories", "recommend_priority", "write_text"]);
const actions = z.array(z.strictObject({ id, label: text, action: actionName })).min(1).max(4);
const envelope = { message: text, nextActions: actions };

export const clarificationPayloadSchema = z.strictObject({ questions: z.array(question).min(1).max(3) });
export const rolePayloadSchema = z.strictObject({ roles: z.array(z.strictObject({ temporaryId: id, name: shortText, rationale: text })).min(1).max(8) });
export const storyPayloadSchema = z.strictObject({
  primaryRole: shortText,
  stories: z.array(z.strictObject({ temporaryId: id, role: shortText, action: shortText, benefit: shortText, rationale: text.optional(), happyPathOrder: z.number().int().min(1).max(20), selectedByDefault: z.boolean() })).min(5).max(8),
});
export const priorityPayloadSchema = z.strictObject({ storyId: z.string().min(1).max(100), rationale: text });

export const clarificationSchema = z.strictObject({ ...envelope, payload: clarificationPayloadSchema }).superRefine((value, ctx) => {
  if (new Set(value.payload.questions.map(item => item.id)).size !== value.payload.questions.length) ctx.addIssue({ code: "custom", message: "Question IDs must be unique" });
});
export const roleProposalSchema = z.strictObject({ ...envelope, payload: rolePayloadSchema }).superRefine((value, ctx) => {
  const roles = value.payload.roles;
  if (new Set(roles.map(item => item.temporaryId)).size !== roles.length || new Set(roles.map(item => item.name.toLocaleLowerCase())).size !== roles.length) ctx.addIssue({ code: "custom", message: "Roles must be unique" });
});
export const storyProposalSchema = z.strictObject({ ...envelope, payload: storyPayloadSchema }).superRefine((value, ctx) => {
  const stories = value.payload.stories;
  if (new Set(stories.map(item => item.temporaryId)).size !== stories.length || new Set(stories.map(item => item.happyPathOrder)).size !== stories.length) ctx.addIssue({ code: "custom", message: "Story IDs and orders must be unique" });
  const ordered = [...stories].sort((a, b) => a.happyPathOrder - b.happyPathOrder);
  if (ordered.some((story, index) => story.happyPathOrder !== index + 1)) ctx.addIssue({ code: "custom", message: "Happy path order must be contiguous" });
});
export const priorityRecommendationSchema = z.strictObject({ ...envelope, payload: priorityPayloadSchema });

export const taskSchemas = { clarify_idea: clarificationSchema, propose_roles: roleProposalSchema, propose_stories: storyProposalSchema, recommend_priority: priorityRecommendationSchema };
export type ConversationResponse = z.infer<(typeof taskSchemas)[keyof typeof taskSchemas]>;
export type GuidedResponse = ConversationResponse;
export type AiTask = ConversationTask | "propose_prototype" | "propose_refinement" | "review_backlog";

export const conversationInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), text: z.string().trim().min(1).max(4000), task: conversationTaskSchema.optional() }),
  z.strictObject({ kind: z.literal("answer"), messageId: z.string().min(1).max(100), questionId: id, optionIds: z.array(id).max(6), other: z.string().trim().min(1).max(1000).optional(), skip: z.boolean() }),
  z.strictObject({ kind: z.literal("retry"), messageId: z.string().min(1).max(100) }),
]);
export type ConversationInput = z.infer<typeof conversationInputSchema>;

export const proposalCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("confirm_roles"), proposalId: z.string().min(1).max(100), roles: z.array(z.strictObject({ temporaryId: id, name: shortText })).min(1).max(8), primaryTemporaryId: id }),
  z.strictObject({ kind: z.literal("confirm_stories"), proposalId: z.string().min(1).max(100), selectedTemporaryIds: z.array(id).min(1).max(8) }),
  z.strictObject({ kind: z.literal("confirm_priority"), proposalId: z.string().min(1).max(100), storyId: z.string().min(1).max(100) }),
]);

export type ConversationEntry = { id: string; role: "user" | "assistant" | "system_event"; messageType: string; content: string; createdAt: string; response: ConversationResponse | null; task: ConversationTask | null; proposalId: string | null; proposalStatus: "pending" | "applied" | "rejected" | "superseded" | null; answeredQuestionIds: string[]; requestStatus: "processing" | "complete" | "failed" | null };
export type ConversationData = { mode: "fixture" | "live" | "unavailable"; messages: ConversationEntry[]; roles: Array<{ id: string; name: string; isPrimary: boolean }>; stories: Array<{ id: string; role: string; action: string; benefit: string; position: number }> };
