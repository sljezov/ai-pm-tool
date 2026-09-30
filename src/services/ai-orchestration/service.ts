import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { conversationInputSchema, taskSchemas, type ConversationData, type ConversationEntry, type ConversationTask } from "@/domain/ai/contracts";
import { aiMode, configuredProvider, generateValidated, AiInvalidOutputError, AiUnavailableError, type AiProvider } from "@/lib/ai/provider";
import { projectIdSchema } from "@/lib/validation/projects";
import { BacklogError } from "@/lib/validation/backlog";
import { storyInclude } from "@/services/stories/service";
import { processingLeaseMs } from "@/services/requests/idempotency";

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
    const expired = await client.requestExecution.findMany({ where: { projectId: id, scope: "conversation", status: "processing", updatedAt: { lt: new Date(Date.now() - processingLeaseMs) }, resourceId: { not: null } } });
    if (expired.length) await client.$transaction(async tx => {
      for (const execution of expired) {
        const message = await tx.conversationMessage.findFirst({ where: { id: execution.resourceId!, projectId: id, role: "user" } });
        if (message) await tx.conversationMessage.update({ where: { id: message.id }, data: { structuredPayloadJson: JSON.stringify({ ...decode(message.structuredPayloadJson), status: "failed" }) } });
        await tx.requestExecution.update({ where: { id: execution.id }, data: { status: "failed" } });
      }
    });
    let rows = await client.conversationMessage.findMany({ where: { projectId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const staleRows = rows.filter(row => row.role === "user" && row.createdAt.getTime() < Date.now() - processingLeaseMs && decode(row.structuredPayloadJson).status === "processing");
    if (staleRows.length) {
      await client.$transaction(staleRows.map(row => client.conversationMessage.update({ where: { id: row.id }, data: { structuredPayloadJson: JSON.stringify({ ...decode(row.structuredPayloadJson), status: "failed" }) } })));
      rows = await client.conversationMessage.findMany({ where: { projectId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    }
    const proposalIds = rows.flatMap(row => { const stored = decode(row.structuredPayloadJson); const value = stored.proposalId; const findings = Array.isArray(stored.findingProposals) ? stored.findingProposals as Array<{ proposalId: string }> : []; return [...(typeof value === "string" ? [value] : []), ...findings.map(item => item.proposalId)]; });
    const statuses = new Map((proposalIds.length ? await client.proposal.findMany({ where: { projectId: id, id: { in: proposalIds } }, select: { id: true, status: true, beforeSnapshotJson: true } }) : []).map(item => [item.id, item]));
    return {
      mode: aiMode(),
      roles: current.roles.map(role => ({ id: role.id, name: role.name, isPrimary: role.isPrimary })),
      stories: current.stories.map(story => ({ id: story.id, role: story.role, action: story.action, benefit: story.benefit, position: story.position })),
      messages: rows.map(row => {
        const stored = decode(row.structuredPayloadJson);
        const task = isTask(stored.task) ? stored.task : null;
        const parsed = task && row.role === "assistant" ? taskSchemas[task].safeParse(stored.response) : null;
        const proposalId = typeof stored.proposalId === "string" ? stored.proposalId : null;
        return { id: row.id, role: row.role, messageType: row.messageType, content: row.content, createdAt: row.createdAt.toISOString(), task, response: parsed?.success ? parsed.data : null, proposalId, proposalStatus: proposalId ? statuses.get(proposalId)?.status ?? null : null, findingProposals: (Array.isArray(stored.findingProposals) ? stored.findingProposals as Array<{ temporaryId: string; proposalId: string }> : []).map(item => ({ ...item, status: statuses.get(item.proposalId)?.status ?? "superseded", beforeStories: (() => { try { const value = JSON.parse(statuses.get(item.proposalId)?.beforeSnapshotJson ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } })() })), requestStatus: stored.status === "processing" || stored.status === "complete" || stored.status === "failed" ? stored.status : null, answeredQuestionIds: Array.isArray(stored.answeredQuestionIds) ? stored.answeredQuestionIds.filter((value): value is string => typeof value === "string") : [] } satisfies ConversationEntry;
      }),
    };
  }
  async function submit(id: string, raw: unknown, requestKey?: string): Promise<ConversationData> {
    const input = conversationInputSchema.parse(raw);
    const current = await project(id);
    let text: string;
    let task: ConversationTask = "clarify_idea";
    let userMessageId: string;
    let answeredQuestionIds: string[] = [];
    const history = await get(id);
    const latestResponse = [...history.messages].reverse().find(message => message.response);
    const existingExecution = requestKey ? await client.requestExecution.findUnique({ where: { projectId_requestKey: { projectId: id, requestKey } } }) : null;
    if (existingExecution?.scope !== undefined && existingExecution.scope !== "conversation") throw new BacklogError("Päringu võti on juba teise toimingu jaoks kasutatud.", 409);
    if (existingExecution?.status === "complete") return get(id);
    if (existingExecution?.status === "processing") throw new BacklogError("Päring on juba töös.", 409);
    const resumedMessage = existingExecution?.resourceId ? await client.conversationMessage.findFirst({ where: { id: existingExecution.resourceId, projectId: id, role: "user" } }) : null;
    if (input.kind === "retry" || resumedMessage) {
      const message = resumedMessage ?? await client.conversationMessage.findFirst({ where: { id: input.kind === "retry" ? input.messageId : "", projectId: id, role: "user" } });
      if (!message) throw new BacklogError("Sõnumit ei leitud.", 404);
      const state = decode(message.structuredPayloadJson);
      if (state.status === "complete") return get(id);
      if (state.status === "processing") throw new BacklogError("Päring on juba töös.", 409);
      task = isTask(state.task) ? state.task : "clarify_idea";
      text = message.content;
      answeredQuestionIds = Array.isArray(state.answeredQuestionIds) ? state.answeredQuestionIds.filter((value): value is string => typeof value === "string") : [];
      const claim = await client.$transaction(async tx => {
        const updated = await tx.conversationMessage.updateMany({ where: { id: message.id, projectId: id, structuredPayloadJson: message.structuredPayloadJson }, data: { structuredPayloadJson: JSON.stringify({ ...state, status: "processing" }) } });
        if (requestKey && existingExecution) await tx.requestExecution.update({ where: { id: existingExecution.id }, data: { status: "processing" } });
        else if (requestKey) await tx.requestExecution.create({ data: { projectId: id, requestKey, scope: "conversation", status: "processing", resourceId: message.id } });
        return updated;
      });
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
        task = input.task ?? (current.currentStage === "refinements" || current.currentStage === "prototype" && current.recommendedNextStage === "refinements" ? "propose_refinement" : latestResponse?.task ?? "clarify_idea");
      }
      const message = await client.$transaction(async tx => {
        const created = await tx.conversationMessage.create({ data: { projectId: id, role: "user", messageType: input.kind, content: text, structuredPayloadJson: JSON.stringify({ task, status: "processing", answeredQuestionIds }) } });
        if (requestKey) await tx.requestExecution.create({ data: { projectId: id, requestKey, scope: "conversation", status: "processing", resourceId: created.id } });
        return created;
      });
      userMessageId = message.id;
    }
    if (task === "propose_stories" && !current.roles.some(role => role.isPrimary)) {
      await client.$transaction(async tx => { await tx.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ task, status: "failed", answeredQuestionIds }) } }); if (requestKey) await tx.requestExecution.update({ where: { projectId_requestKey: { projectId: id, requestKey } }, data: { status: "failed" } }); });
      throw new BacklogError("Kinnita esmalt rollid ja vali peamine roll.", 409);
    }
    if (task === "recommend_priority" && !current.stories.length) {
      await client.$transaction(async tx => { await tx.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ task, status: "failed", answeredQuestionIds }) } }); if (requestKey) await tx.requestExecution.update({ where: { projectId_requestKey: { projectId: id, requestKey } }, data: { status: "failed" } }); });
      throw new BacklogError("Lisa enne backlogi vähemalt üks lugu.", 409);
    }
    if ((task === "propose_prototype" || task === "propose_refinement") && !current.stories.some(story => story.id === current.selectedStoryId)) {
      await client.$transaction(async tx => { await tx.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ task, status: "failed", answeredQuestionIds }) } }); if (requestKey) await tx.requestExecution.update({ where: { projectId_requestKey: { projectId: id, requestKey } }, data: { status: "failed" } }); });
      throw new BacklogError(task === "propose_refinement" ? "Vali backlogist lugu, mida kliendi täpsustusega muuta." : "Vali backlogist lugu, millele kriteeriumid ja mockup koostada.", 409);
    }
    const requestState = { task, answeredQuestionIds };
    try {
      const selectedStory = (task === "propose_prototype" || task === "propose_refinement") && current.selectedStoryId ? await client.story.findFirst({ where: { id: current.selectedStoryId, projectId: id, archivedAt: null }, include: storyInclude }) : null;
      if ((task === "propose_prototype" || task === "propose_refinement") && !selectedStory) throw new AiInvalidOutputError();
      const turns = await client.conversationMessage.findMany({ where: { projectId: id, role: { in: ["user", "assistant"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12 });
      const context = {
        project: { name: current.name, description: current.description, currentStage: current.currentStage, recommendedNextStage: current.recommendedNextStage },
        roles: current.roles.map(role => ({ name: role.name, isPrimary: role.isPrimary })),
        backlog: task === "review_backlog" ? await client.story.findMany({ where: { projectId: id, archivedAt: null }, orderBy: { position: "asc" }, include: storyInclude }) : current.stories.map(story => ({ id: story.id, role: story.role, action: story.action, benefit: story.benefit, position: story.position, status: story.status })),
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
        const findingProposals: Array<{ temporaryId: string; proposalId: string }> = [];
        if ("findings" in response.payload) {
          await tx.proposal.updateMany({ where: { projectId: id, type: "grooming", status: "pending" }, data: { status: "superseded", resolvedAt: new Date() } });
          for (const finding of response.payload.findings) {
            const row = await tx.proposal.create({ data: { projectId: id, type: "grooming", inputText: text, afterSnapshotJson: JSON.stringify(finding), beforeSnapshotJson: JSON.stringify(context.backlog) } });
            findingProposals.push({ temporaryId: finding.temporaryId, proposalId: row.id });
          }
        }
        const type = proposalType[task];
        if (type) {
          await tx.proposal.updateMany({ where: { projectId: id, type, status: "pending", ...(selectedStory ? { targetStoryId: selectedStory.id } : {}) }, data: { status: "superseded", resolvedAt: new Date() } });
          const proposal = await tx.proposal.create({ data: { projectId: id, type, inputText: text, afterSnapshotJson: JSON.stringify(response.payload), ...(selectedStory ? { targetStoryId: selectedStory.id, baseStoryVersion: selectedStory.version, beforeSnapshotJson: JSON.stringify(selectedStory) } : {}) } });
          proposalId = proposal.id;
          if ("crossStorySuggestions" in response.payload) for (const suggestion of response.payload.crossStorySuggestions) {
            await tx.proposal.create({ data: { projectId: id, type: "cross_story_suggestion", targetStoryId: suggestion.targetStoryId, inputText: text, afterSnapshotJson: JSON.stringify({ ...suggestion, sourceProposalId: proposal.id }) } });
          }
        }
        await tx.conversationMessage.create({ data: { projectId: id, role: "assistant", messageType: task, content: response.message, structuredPayloadJson: JSON.stringify({ task, response, proposalId, findingProposals, replyTo: userMessageId }) } });
        await tx.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ ...requestState, status: "complete" }) } });
        if (requestKey) await tx.requestExecution.update({ where: { projectId_requestKey: { projectId: id, requestKey } }, data: { status: "complete", completedAt: new Date() } });
      });
    } catch (error) {
      const safe = error instanceof AiInvalidOutputError ? error : new AiUnavailableError();
      await client.$transaction(async tx => {
        await tx.conversationMessage.update({ where: { id: userMessageId }, data: { structuredPayloadJson: JSON.stringify({ ...requestState, status: "failed" }) } });
        await tx.conversationMessage.create({ data: { projectId: id, role: "system_event", messageType: "ai_error", content: safe.message, structuredPayloadJson: JSON.stringify({ replyTo: userMessageId }) } });
        if (requestKey) await tx.requestExecution.update({ where: { projectId_requestKey: { projectId: id, requestKey } }, data: { status: "failed" } });
      });
    }
    return get(id);
  }
  return { get, submit };
}
