import { describe, expect, it } from "vitest";
import { recommendedStage, type RecommendationState } from "@/domain/stages/recommendation";

const base: RecommendationState = { roleCount: 0, storyCount: 0, selectedStory: null, pendingProposalTypes: [], appliedRefinement: false, appliedGrooming: false };

describe("recommended next stage", () => {
  it.each([
    [{}, "idea"],
    [{ pendingProposalTypes: ["roles"] }, "roles"],
    [{ roleCount: 2 }, "stories"],
    [{ roleCount: 2, storyCount: 4 }, "priorities"],
    [{ roleCount: 2, storyCount: 4, selectedStory: { criterionCount: 2, hasMockup: true } }, "prototype"],
    [{ roleCount: 2, storyCount: 4, selectedStory: { criterionCount: 3, hasMockup: true } }, "refinements"],
    [{ roleCount: 2, storyCount: 4, selectedStory: { criterionCount: 3, hasMockup: true }, appliedRefinement: true }, "grooming"],
  ] as const)("derives %j as %s", (override, expected) => {
    expect(recommendedStage({ ...base, ...override })).toBe(expected);
  });
});
