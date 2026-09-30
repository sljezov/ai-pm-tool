import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { conversationInputSchema, taskSchemas, type ConversationData, type ConversationEntry, type ConversationTask } from "@/domain/ai/contracts";
import { aiMode, configuredProvider, generateValidated, AiInvalidOutputError, AiUnavailableError, type AiProvider } from "@/lib/ai/provider";
import { projectIdSchema } from "@/lib/validation/projects";
import { BacklogError } from "@/lib/validation/backlog";
import { storyInclude } from "@/services/stories/service";

function decode(raw: string | null): Record<string, unknown> { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
function isTask(value: unknown): value is ConversationTask { return typeof value === "string" && Object.hasOwn(taskSchemas, value); }
const proposalType: Partial<Record<ConversationTask, string>> = { propose_roles: "roles", propose_stories: "stories", recommend_priority: "priority", propose_prototype: "prototype", propose_refinement: "refinement" };

export function conversationService(client: PrismaClient, provider?: AiProvider) {
  async function project(id: string) {
    const found = await client.project.findUnique({ where: { id: projectIdSchema.parse(id) }, include: { roles: { orderBy: { position: "asc" } }, stories: { where: { archivedAt: null }, orderBy: [{ position: "asc" }, { id: "asc" }] } } });
    if (!found) throw new BacklogError("Projekti ei leitud.", 404);
    return found;
  }
  async function get(id: string): Promise<ConversationData> {
    const current = await project(id);
    const rows = await client.conversationMessage.findMany({ where: { projectId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const proposalIds = rows.flatMap(row => { const value = decode(row.structuredPayloadJson).proposalId; return typeof value === "string" ? [value] : []; });
    const statuses = new Map((proposalIds.length ? await client.proposal.findMany({ where: { projectId: id, id: { in: proposalIds } }, select: { id: true, status: true } }) : []).map(item => [item.id, item.status]));
    return {
      mode: aiMode(),
      roles: current.roles.map(role => ({ id: role.id, name: role.name, isPrimary: role.isPrimary })),
      stories: current.stories.map(story => ({ id: story.id, role: story.role, action: story.action, benefit: story.benefit, position: story.position })),
      messages: rows.map(row => {
        const stored = decode(row.structuredPayloadJson);
        const task = isTask(stored.task) ? stored.task : null;
        const parsed = task && row.role === "assistant" ? taskSchemas[task].safeParse(stored.response) : null;
        const proposalId = typeof stored.proposalId === "string" ? stored.proposalId : null;
        return { id: row.id, role: row.role, messageType: row.messageType, content: row.content, createdAt: row.createdAt.toISOString(), task, response: parsed?.success ? parsed.data : null, proposalId, proposalStatus: proposalId ? statuses.get(proposalId) ?? null : null, requestStatus: stored.status === "processing" || stored.status === "complete" || stored.status === "failed" ? stored.status : null, answeredQuestionIds: Array.isArray(stored.answeredQuestionIds) ? stored.answeredQuestionIds.filter((value): value is string => typeof value === "string") : [] } satisfies ConversationEntry;
      }),
    };
  }
  async function submit(id: string, raw: unknown): Promise<ConversationData> {
    const input = conversationInputSchema.parse(raw);
    const current = await project(id);
    let text: string;
    let task: ConversationTask = "clarify_idea";
    let userMessageId: string;
    let answeredQuestionIds: string[] = [];
    const history = await get(id);
    const latestResponse = [...history.messages].reverse().find(message => message.response);
    if (input.kind === "retry") {
      const message = await client.conversationMessage.findFirst({ where: { id: input.messageId, projectId: id, role: "user" } });
      if (!message) throw new BacklogError("Sõnumit ei leitud.", 404);
      const state = decode(message.structuredPayloadJson);
      if (state.status === "complete") return get(id);
      if (state.status === "processing") throw new BacklogError("Päring on juba töös.", 409);
      task = isTask(state.task) ? state.task : "clarify_idea";
      text = message.content;
      answeredQuestionIds = Array.isArray(state.answeredQuestionIds) ? state.answeredQuestionIds.filter((value): value is string => typeof value === "string") : [];
      const claim = await client.conversationMessage.updateMany({ where: { id: message.id, projectId: id, structuredPayloadJson: message.structuredPayloadJson }, data: { structuredPayloadJson: JSON.stringify({ ...state, status: "processing" }) } });
      if (!claim.count) throw new BacklogError("Päring on juba töös.", 409);
      userMessageId = message.id;
    } else {
      if (input.kind === "answer") {
        const source = history.messages.find(message => message.id === input.messageId && message.task === "clarify_idea" && message.response && "questions" in message.response.payload);
        if (!source?.response || !("questions" in source.response.payload) || source.id !== latestResponse?.id) throw new BacklogError("Küsimus pole enam aktiivne.", 409);
        const question = source.response.payload.questions.find(item => item.id === input.questionId);
        if (!question) throw new BacklogError("Küsimust ei leitud.", 400);
        const previous = history.messages.filter(message => message.role === "user").flatMap(message => message.answeredQuestionIds);
        if (previous.includes(question.id)) throw new BacklogError("Küsimusele on juba vastatud.", 409);
        const options = question.options.filter(option => input.optionIds.includes(option.id));
        if (new Set(input.optionIds).size !== input.optionIds.length || options.length !== input.optionIds.length || (question.selectionMode === "single" && options.length > 1) || (input.skip && (options.length || input.other)) || (!input.skip && !options.length && !input.other)) throw new BacklogError("Vali vastus, kirjuta muu vastus või jäta küsimus vahele.", 400);
        text = `${question.text}\n${input.skip ? "Jäta vahele" : [...options.map(option => option.label), ...(input.other ? [`Muu: ${input.other}`] : [])].join(", ")}`;
        answeredQuestionIds = [question.id];
        task = source.response.payload.questions.every(item => item.id === question.id || previous.includes(item.id)) ? "propose_roles" : "clarify_idea";
      } else {
        text = input.text;
        task = input.task ?? (current.currentStage === "refinements" || current.recommendedNextStage === "refinements" ? "propose_refinement" : latestResponse?.task ?? "clarify_idea");
      }
      const message = await client.conversationMessage.create({ data: { projectId: id, role: "user", messageType: input.kind, content: text, structuredPayloadJson: JSON.stringify({ task, status: "processing", answeredQuestionIds }) } });
      userMessageId = message.id;
    }
    if (task === "propose_stories" && !current.roles.some(role => role.isPrimary)) {
      await client.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ task, status: "failed", answeredQuestionIds }) } });
      throw new BacklogError("Kinnita esmalt rollid ja vali peamine roll.", 409);
    }
    if (task === "recommend_priority" && !current.stories.length) {
      await client.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ task, status: "failed", answeredQuestionIds }) } });
      throw new BacklogError("Lisa enne backlogi vähemalt üks lugu.", 409);
    }
    if ((task === "propose_prototype" || task === "propose_refinement") && !current.stories.some(story => story.id === current.selectedStoryId)) {
      await client.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ task, status: "failed", answeredQuestionIds }) } });
      throw new BacklogError("Vali backlogist lugu, millele kriteeriumid ja mockup koostada.", 409);
    }
    const requestState = { task, answeredQuestionIds };
    try {
      const selectedStory = (task === "propose_prototype" || task === "propose_refinement") && current.selectedStoryId ? await client.story.findFirst({ where: { id: current.selectedStoryId, projectId: id, archivedAt: null }, include: storyInclude }) : null;
      if ((task === "propose_prototype" || task === "propose_refinement") && !selectedStory) throw new AiInvalidOutputError();
      const turns = await client.conversationMessage.findMany({ where: { projectId: id, role: { in: ["user", "assistant"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12 });
      const context = {
        project: { name: current.name, description: current.description, currentStage: current.currentStage, recommendedNextStage: current.recommendedNextStage },
        roles: current.roles.map(role => ({ name: role.name, isPrimary: role.isPrimary })),
        backlog: current.stories.map(story => ({ id: story.id, role: story.role, action: story.action, benefit: story.benefit, position: story.position, status: story.status })),
        input: text,
        selectedStoryId: current.selectedStoryId,
        selectedStory: selectedStory ? { id: selectedStory.id, version: selectedStory.version, role: selectedStory.role, action: selectedStory.action, benefit: selectedStory.benefit, requiresMockup: selectedStory.requiresMockup, criteria: selectedStory.criteria.map(item => ({ text: item.text, mockupElementIds: JSON.parse(item.mockupElementIdsJson) })), openQuestions: selectedStory.openQuestions.filter(item => !item.resolvedAt).map(item => item.text), mockup: selectedStory.mockupVersions[0] ? JSON.parse(selectedStory.mockupVersions[0].structureJson) : null } : undefined,
        conversation: turns.reverse().map(turn => ({ role: turn.role, content: turn.content.slice(0, 4000) })),
        answeredQuestionIds: [...new Set([...history.messages.flatMap(message => message.answeredQuestionIds), ...answeredQuestionIds])],
        boundaries: { mode: "proposal_only", mutableEntities: [], mutableFields: ["role", "action", "benefit", "criteria", "mockup"], ...(selectedStory ? { targetStoryId: selectedStory.id, baseStoryVersion: selectedStory.version } : {}) },
      };
      const response = await generateValidated(provider ?? configuredProvider(), task, context);
      await client.$transaction(async tx => {
        let proposalId: string | undefined;
        const type = proposalType[task];
        if (type) {
          await tx.proposal.updateMany({ where: { projectId: id, type, status: "pending", ...(selectedStory ? { targetStoryId: selectedStory.id } : {}) }, data: { status: "superseded", resolvedAt: new Date() } });
          const proposal = await tx.proposal.create({ data: { projectId: id, type, inputText: text, afterSnapshotJson: JSON.stringify(response.payload), ...(selectedStory ? { targetStoryId: selectedStory.id, baseStoryVersion: selectedStory.version, beforeSnapshotJson: JSON.stringify(selectedStory) } : {}) } });
          proposalId = proposal.id;
          if ("crossStorySuggestions" in response.payload) for (const suggestion of response.payload.crossStorySuggestions) {
            await tx.proposal.create({ data: { projectId: id, type: "cross_story_suggestion", targetStoryId: suggestion.targetStoryId, inputText: text, afterSnapshotJson: JSON.stringify({ ...suggestion, sourceProposalId: proposal.id }) } });
          }
        }
        await tx.conversationMessage.create({ data: { projectId: id, role: "assistant", messageType: task, content: response.message, structuredPayloadJson: JSON.stringify({ task, response, proposalId, replyTo: userMessageId }) } });
        await tx.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ ...requestState, status: "complete" }) } });
      });
    } catch (error) {
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
