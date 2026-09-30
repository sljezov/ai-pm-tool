export const stages = ["idea", "roles", "stories", "priorities", "prototype", "refinements", "grooming"] as const;
export type ProjectStage = (typeof stages)[number];
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
