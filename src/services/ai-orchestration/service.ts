import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { conversationInputSchema, taskSchemas, type ConversationData, type ConversationEntry, type GuidedTask } from "@/domain/ai/contracts";
import { aiMode, configuredProvider, generateValidated, AiInvalidOutputError, AiUnavailableError, type AiProvider } from "@/lib/ai/provider";
import { projectIdSchema } from "@/lib/validation/projects";
import { BacklogError } from "@/lib/validation/backlog";

function decode(raw: string | null): Record<string, unknown> { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
export function conversationService(client: PrismaClient, provider?: AiProvider) {
  async function project(id: string) {
    const found = await client.project.findUnique({ where: { id: projectIdSchema.parse(id) }, include: { roles: { orderBy: { position: "asc" } } } });
    if (!found) throw new BacklogError("Projekti ei leitud.", 404);
    return found;
  }
  async function get(id: string): Promise<ConversationData> {
    await project(id);
    const rows = await client.conversationMessage.findMany({ where: { projectId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return { mode: aiMode(), messages: rows.map(row => {
      const stored = decode(row.structuredPayloadJson);
      const task = stored.task === "clarify_idea" || stored.task === "propose_roles" ? stored.task : null;
      const parsed = task && row.role === "assistant" ? taskSchemas[task].safeParse(stored.response) : null;
      return { id: row.id, role: row.role, messageType: row.messageType, content: row.content, createdAt: row.createdAt.toISOString(), task, response: parsed?.success ? parsed.data : null, requestStatus: stored.status === "processing" || stored.status === "complete" || stored.status === "failed" ? stored.status : null, answeredQuestionIds: Array.isArray(stored.answeredQuestionIds) ? stored.answeredQuestionIds.filter((v): v is string => typeof v === "string") : [] } satisfies ConversationEntry;
    }) };
  }
  async function submit(id: string, raw: unknown): Promise<ConversationData> {
    const input = conversationInputSchema.parse(raw);
    const current = await project(id);
    let text: string;
    let task: GuidedTask = "clarify_idea";
    let userMessageId: string;
    let answeredQuestionIds: string[] = [];
    const history = await get(id);
    const latestResponse = [...history.messages].reverse().find(m => m.response);
    if (input.kind === "retry") {
      const message = await client.conversationMessage.findFirst({ where: { id: input.messageId, projectId: id, role: "user" } });
      if (!message) throw new BacklogError("Sõnumit ei leitud.", 404);
      const state = decode(message.structuredPayloadJson);
      if (state.status === "complete") return get(id);
      if (state.status === "processing") throw new BacklogError("Päring on juba töös.", 409);
      task = state.task === "propose_roles" ? "propose_roles" : "clarify_idea";
      text = message.content;
      answeredQuestionIds = Array.isArray(state.answeredQuestionIds) ? state.answeredQuestionIds.filter((v): v is string => typeof v === "string") : [];
      const claim = await client.conversationMessage.updateMany({ where: { id: message.id, projectId: id, structuredPayloadJson: message.structuredPayloadJson }, data: { structuredPayloadJson: JSON.stringify({ ...state, status: "processing" }) } });
      if (!claim.count) throw new BacklogError("Päring on juba töös.", 409);
      userMessageId = message.id;
    } else {
      if (input.kind === "answer") {
        const source = history.messages.find(m => m.id === input.messageId && m.task === "clarify_idea" && m.response && "questions" in m.response.payload);
        if (!source?.response || !("questions" in source.response.payload) || source.id !== latestResponse?.id) throw new BacklogError("Küsimus pole enam aktiivne.", 409);
        const question = source.response.payload.questions.find(q => q.id === input.questionId);
        if (!question) throw new BacklogError("Küsimust ei leitud.", 400);
        const previous = history.messages.filter(m => m.role === "user").flatMap(m => m.answeredQuestionIds);
        if (previous.includes(question.id)) throw new BacklogError("Küsimusele on juba vastatud.", 409);
        const options = question.options.filter(o => input.optionIds.includes(o.id));
        if (new Set(input.optionIds).size !== input.optionIds.length || options.length !== input.optionIds.length || (question.selectionMode === "single" && options.length > 1) || (input.skip && (options.length || input.other)) || (!input.skip && !options.length && !input.other)) throw new BacklogError("Vali vastus, kirjuta muu vastus või jäta küsimus vahele.", 400);
        text = `${question.text}\n${input.skip ? "Jäta vahele" : [...options.map(o => o.label), ...(input.other ? [`Muu: ${input.other}`] : [])].join(", ")}`;
        answeredQuestionIds = [question.id];
        const allAnswered = source.response.payload.questions.every(q => q.id === question.id || previous.includes(q.id));
        task = allAnswered ? "propose_roles" : "clarify_idea";
      } else {
        text = input.text;
        task = input.task ?? (latestResponse?.task === "propose_roles" ? "propose_roles" : "clarify_idea");
      }
      const message = await client.conversationMessage.create({ data: { projectId: id, role: "user", messageType: input.kind, content: text, structuredPayloadJson: JSON.stringify({ task, status: "processing", answeredQuestionIds }) } });
      userMessageId = message.id;
    }
    const requestState = { task, answeredQuestionIds };
    try {
      // Only task-relevant database state is sent; conversation never substitutes for domain state.
      const turns = await client.conversationMessage.findMany({ where: { projectId: id, role: { in: ["user", "assistant"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12 });
      const response = await generateValidated(provider ?? configuredProvider(), task, {
        project: { name: current.name, description: current.description, currentStage: current.currentStage, recommendedNextStage: current.recommendedNextStage },
        roles: current.roles.map(role => ({ name: role.name, isPrimary: role.isPrimary })), input: text,
        conversation: turns.reverse().map(turn => ({ role: turn.role, content: turn.content.slice(0, 4000) })),
        answeredQuestionIds: [...new Set([...history.messages.flatMap(m => m.answeredQuestionIds), ...answeredQuestionIds])],
        boundaries: { mode: "proposal_only", mutableEntities: [] },
      });
      await client.$transaction(async tx => {
        let proposalId: string | undefined;
        if (task === "propose_roles") {
          await tx.proposal.updateMany({ where: { projectId: id, type: "roles", status: "pending" }, data: { status: "superseded", resolvedAt: new Date() } });
          const proposal = await tx.proposal.create({ data: { projectId: id, type: "roles", inputText: text, afterSnapshotJson: JSON.stringify(response.payload) } });
          proposalId = proposal.id;
        }
        await tx.conversationMessage.create({ data: { projectId: id, role: "assistant", messageType: task, content: response.message, structuredPayloadJson: JSON.stringify({ task, response, proposalId, replyTo: userMessageId }) } });
        await tx.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ ...requestState, status: "complete" }) } });
      });
    } catch (error) {
      // Persist only a safe generic failure, never raw provider errors, keys or prompts.
      const safe = error instanceof AiInvalidOutputError ? error : new AiUnavailableError();
      await client.$transaction(async tx => {
        await tx.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ ...requestState, status: "failed" }) } });
        await tx.conversationMessage.create({ data: { projectId: id, role: "system_event", messageType: "ai_error", content: safe.message, structuredPayloadJson: JSON.stringify({ replyTo: userMessageId }) } });
      });
    }
    return get(id);
  }
  return { get, submit };
}
