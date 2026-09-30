import type { ProjectStage } from "./stages";

export type RecommendationState = {
  roleCount: number;
  storyCount: number;
  selectedStory: { criterionCount: number; hasMockup: boolean } | null;
  pendingProposalTypes: readonly string[];
  appliedRefinement: boolean;
  appliedGrooming: boolean;
};

export function recommendedStage(state: RecommendationState): ProjectStage {
  if (state.storyCount > 0) {
    if (!state.selectedStory) return "priorities";
    if (state.selectedStory.criterionCount < 3 || !state.selectedStory.hasMockup) return "prototype";
    if (state.appliedRefinement || state.appliedGrooming) return "grooming";
    return "refinements";
  }
  if (state.roleCount > 0) return "stories";
  if (state.pendingProposalTypes.includes("roles")) return "roles";
  return "idea";
}
