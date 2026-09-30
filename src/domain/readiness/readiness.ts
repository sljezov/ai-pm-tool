import { checkCriterion, mockupElementIds, parseCriterionReferences } from "@/domain/criteria/validation";
export type ReadinessIssue = { code: string; area: "story" | "criteria" | "mockup" | "questions"; message: string };
export type ReadinessStory = { role: string; action: string; benefit: string; requiresMockup: boolean; criteria: { text: string; mockupElementIdsJson: string }[]; openQuestions: { resolvedAt: unknown }[]; mockupVersions: { structureJson: string }[] };
export function calculateReadiness(story: ReadinessStory) {
  const issues: ReadinessIssue[] = [];
  if (![story.role, story.action, story.benefit].every(part => part.trim())) issues.push({ code: "connextra", area: "story", message: "Täida roll, tegevus ja kasu." });
  if (story.criteria.length < 3) issues.push({ code: "criterion_count", area: "criteria", message: "Lisa vähemalt kolm vastuvõtukriteeriumi." });
  const ids = mockupElementIds(story.mockupVersions[0]?.structureJson);
  story.criteria.forEach((criterion, index) => {
    const refs = parseCriterionReferences(criterion.mockupElementIdsJson);
    if (!refs) issues.push({ code: "invalid_references", area: "criteria", message: `Kriteerium ${index + 1}: mockup-viited on vigased.` });
    const check = checkCriterion(criterion.text, refs ?? [], ids);
    if (check.status !== "pass") issues.push({ code: "criterion_validation", area: "criteria", message: `Kriteerium ${index + 1}: ${check.messages.map(item => item.message).join(" ")}` });
  });
  if (story.requiresMockup && !ids.length) issues.push({ code: "mockup_required", area: "mockup", message: "Kasutajaliidese lugu vajab mockup'i." });
  if (story.openQuestions.some(question => !question.resolvedAt)) issues.push({ code: "open_questions", area: "questions", message: "Lahenda kõik avatud küsimused." });
  return { ready: issues.length === 0, issues };
}
