import type { RefinementPayload } from "@/domain/ai/contracts";
import { checkCriterion, mockupElementIds } from "@/domain/criteria/validation";

type CurrentStory = { id: string; version: number; role: string; action: string; benefit: string; criteria: Array<{ text: string; mockupElementIds: string[] }>; mockup: unknown };
/** The same allowlist is checked before display and again inside the apply transaction. */
export function refinementErrors(payload: RefinementPayload, current: CurrentStory, otherIds: string[] = []) {
  const errors: string[] = [];
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (payload.targetStoryId !== current.id || payload.baseStoryVersion !== current.version) errors.push("invalid_story_scope_or_version");
  if (payload.story && !equal(payload.story.before, { role: current.role, action: current.action, benefit: current.benefit })) errors.push("incorrect_story_before");
  if (payload.criteria && !equal(payload.criteria.before, current.criteria)) errors.push("incorrect_criteria_before");
  if (payload.mockup && !equal(payload.mockup.before, current.mockup)) errors.push("incorrect_mockup_before");
  if (payload.crossStorySuggestions.some(item => item.targetStoryId === current.id || !otherIds.includes(item.targetStoryId))) errors.push("invalid_cross_story_suggestion");
  const ids = mockupElementIds(JSON.stringify(payload.mockup?.after ?? current.mockup));
  if ((payload.criteria?.after ?? current.criteria).some(item => new Set(item.mockupElementIds).size !== item.mockupElementIds.length || checkCriterion(item.text, item.mockupElementIds, ids).status === "fail")) errors.push("invalid_criteria_or_mapping");
  return errors;
}
