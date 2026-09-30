export type CriterionCheck = { status: "pass" | "warning" | "fail"; messages: { code: string; message: string }[] };
export function mockupElementIds(structure: string | undefined): string[] {
  if (!structure) return [];
  try {
    const ids: string[] = [];
    const walk = (elements: unknown, depth = 0) => {
      if (!Array.isArray(elements) || depth > 30) return;
      for (const element of elements) if (element && typeof element === "object") {
        if (typeof element.id === "string") ids.push(element.id);
        walk(element.children, depth + 1);
      }
    };
    walk(JSON.parse(structure).elements); return ids;
  } catch { return []; }
}
export function checkCriterion(text: string, references: string[] = [], availableIds: string[] = []): CriterionCheck {
  const messages: CriterionCheck["messages"] = [];
  let failed = false;
  const add = (code: string, message: string, fail = false) => { messages.push({ code, message }); failed ||= fail; };
  if (text.trim().length < 12) add("too_short", "Kirjelda kontrollitavat tingimust vähemalt 12 tähemärgiga.", true);
  if (/\b(kasutajasõbralik\w*|kiire\w*|lihtne\w*|mugav\w*|intuitiivne\w*|selge\w*|efektiivne\w*|kaasaegne\w*)/iu.test(text)) add("subjective", "Asenda subjektiivne hinnang mõõdetava tingimusega.");
  if (/[;]|\bning\b|\bja seejärel\b|[.!?]\s+\p{Lu}/u.test(text)) add("multiple_conditions", "Kontrolli, kas siin on mitu sõltumatut tingimust; vajadusel eralda need.");
  if (references.some(id => !availableIds.includes(id))) add("unknown_element", "Viidatud mockup-elementi ei ole praeguses mockup'is.", true);
  if (/\b(nupp|vorm|väli|ekraan|menüü|vaade|tabel)\w*/iu.test(text) && references.length === 0) add("missing_mapping", "Seo kasutajaliidese tingimus mockup-elemendiga.");
  return { status: failed ? "fail" : messages.length ? "warning" : "pass", messages };
}
