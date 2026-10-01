import type { ConversationTask } from "@/domain/ai/contracts";
export const stages = ["idea", "roles", "stories", "priorities", "prototype", "refinements", "grooming"] as const;
export type ProjectStage = (typeof stages)[number];
/** Each stage has exactly one conversation task that drives it; used to group the chat history by relevance to the current stage. */
export const stageTask: Record<ProjectStage, ConversationTask> = {
  idea: "clarify_idea", roles: "propose_roles", stories: "propose_stories", priorities: "recommend_priority",
  prototype: "propose_prototype", refinements: "propose_refinement", grooming: "review_backlog",
};
export const stageLabels: Record<ProjectStage, string> = {
  idea: "Idee", roles: "Rollid", stories: "Lood", priorities: "Prioriteedid",
  prototype: "Kriteeriumid ja mockup", refinements: "Täpsustused", grooming: "Groomimine",
};
export const stageDescriptions: Record<ProjectStage, string> = {
  idea: "Alusta projekti ideest ja kirjelda, kelle jaoks ning millist probleemi soovid lahendada.",
  roles: "Määra, kes toodet kasutavad ja kelle vajadusest algab peamine kasutusteekond.",
  stories: "Muuda kasutajate vajadused konkreetseteks kasutajalugudeks.",
  priorities: "Sea lood järjekorda ja otsusta, mis kuulub esimesse versiooni.",
  prototype: "Täpsusta valitud loo vastuvõtukriteeriumid ja vaata selle wireframe’i.",
  refinements: "Vaata kliendi täpsustuste mõju enne muudatuste rakendamist.",
  grooming: "Vaata üle lugude suurus, kattuvused ja valmisolek arenduseks.",
};
