import type { BacklogSnapshot } from "@/services/stories/service";
import type { z } from "zod";
import { findingSchema } from "./contracts";
import { checkCriterion, mockupElementIds, parseCriterionReferences } from "@/domain/criteria/validation";
import { mockupFixtures, parseMockup } from "@/domain/mockup/document";
export function fixtureReview(stories: BacklogSnapshot["stories"]) {
  const findings: z.infer<typeof findingSchema>[] = [];
  const source = (story: typeof stories[number]) => ({ storyId: story.id, version: story.version });
  const wording = (story: typeof stories[number]) => ({ role: story.role || "Kasutaja", action: story.action || "salvestada taotluse", benefit: story.benefit || "taotluse olek säilib" });
  for (const story of stories) {
    if (story.size === "L" || story.criteria.length > 6 || /\bja\b|;|\bning\b/iu.test(story.action)) {
      const parts = story.action.split(/\s+(?:ja|ning)\s+|;/iu).map(item => item.trim()).filter(Boolean);
      const midpoint = Math.ceil(story.criteria.length / 2);
      findings.push({ temporaryId: `large-${story.id}`, category: "oversized", explanation: "Lugu sisaldab suurt või mitmest tegevusest koosnevat tööd. Vaata pakutud eraldi tegevused ja kriteeriumide jaotus üle.", operation: { type: "split_story", sources: [source(story)], results: [
        { ...wording(story), action: parts[0] ?? story.action, criterionIds: story.criteria.slice(0, midpoint).map(item => item.id) },
        { ...wording(story), action: parts.slice(1).join(" ja ") || `kontrollida tulemust: ${story.action}`.slice(0, 1000), criterionIds: story.criteria.slice(midpoint).map(item => item.id) },
      ] } });
    }
    const mockup = parseMockup(story.mockupVersions[0]?.structureJson);
    const available = mockupElementIds(JSON.stringify(mockup));
    const malformed = !story.role.trim() || !story.action.trim() || !story.benefit.trim();
    const missing = story.requiresMockup && !available.length;
    const invalid = story.criteria.some(item => { const refs = parseCriterionReferences(item.mockupElementIdsJson); return !refs || checkCriterion(item.text, refs, available).status !== "pass"; });
    for (const category of [malformed ? "malformed_connextra" : null, missing ? "missing_mockup" : null, invalid ? "invalid_criteria" : null] as const) {
      if (!category) continue;
      const proposed = missing ? mockupFixtures.booking : mockup;
      const ids = mockupElementIds(JSON.stringify(proposed));
      findings.push({ temporaryId: `${category}-${story.id}`, category, explanation: category === "malformed_connextra" ? "Täida puuduv roll, tegevus või kasu ja kontrolli Connextra sõnastust." : category === "missing_mockup" ? "Kasutajaliidese lool puudub mockup. Näidisvaade vajab sinu sisulist ülevaatust." : "Kriteeriumid sisaldavad vigaseid viiteid või ebamäärast tingimust. Vaata iga parandus üle.", operation: { type: "repair_story", sources: [source(story)], story: wording(story), mockup: proposed, criteria: story.criteria.map((item, index) => {
        const refs = (parseCriterionReferences(item.mockupElementIdsJson) ?? []).filter(id => ids.includes(id));
        const check = checkCriterion(item.text, refs, ids);
        return { criterionId: item.id, text: check.status === "pass" ? item.text : `Teenus salvestab taotluse ${index + 1} ja tagastab selle tunnuse.`, mockupElementIds: refs };
      }) } });
    }
  }
  const seen = new Map<string, typeof stories[number]>();
  for (const story of stories) {
    const key = `${story.role}|${story.action}|${story.benefit}`.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const previous = seen.get(key);
    if (previous) findings.push({ temporaryId: `duplicate-${story.id}`, category: "duplicate", explanation: "Kaks lugu kirjeldavad sama rolli, tegevust ja kasu. Ühendamisel säilivad ainulaadsed kriteeriumid ja lähteajalugu.", operation: { type: "merge_stories", sources: [source(previous), source(story)], results: [{ ...wording(story), criterionIds: [...previous.criteria, ...story.criteria].map(item => item.id) }] } });
    else seen.set(key, story);
  }
  return findings.slice(0, 30);
}
