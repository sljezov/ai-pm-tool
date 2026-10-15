import { z } from "zod";

export const elementTypes = ["heading", "text", "image_placeholder", "card", "list", "form", "field", "button", "navigation", "table", "calendar", "alert", "confirmation", "container"] as const;
export type MockupProps = { required?: boolean; disabled?: boolean; placeholder?: string; columns?: number; variant?: "table" | "calendar"; headers?: string[]; rows?: string[][]; items?: string[]; inputType?: "text" | "select" | "date" | "email" | "number" | "textarea"; options?: string[]; monthLabel?: string; startWeekday?: number; selectedDay?: number; slots?: string[] };
export type ElementLayout = { x: number; y: number; width: number; height: number };
export type MockupElement = { id: string; type: typeof elementTypes[number]; layout?: ElementLayout; label?: string; text?: string; props?: MockupProps; actions?: { label: string; action: string }[]; children?: MockupElement[] };
export type MockupDocument = { schemaVersion: 1; screenName: string; description?: string; canvas?: { width: number; height: number }; elements: MockupElement[] };
const text = z.string().max(2000);
const element: z.ZodType<MockupElement> = z.lazy(() => z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), type: z.enum(elementTypes), label: text.optional(), text: text.optional(),
  layout: z.object({ x: z.number().int().min(0).max(4000), y: z.number().int().min(0).max(4000), width: z.number().int().min(48).max(1440), height: z.number().int().min(32).max(4000) }).strict().optional(),
  props: z.object({ required: z.boolean().optional(), disabled: z.boolean().optional(), placeholder: z.string().max(200).optional(), columns: z.number().int().min(1).max(6).optional(),
    variant: z.enum(["table", "calendar"]).optional(), headers: z.array(z.string().max(200)).min(1).max(6).optional(), rows: z.array(z.array(z.string().max(200)).min(1).max(6)).max(20).optional(), items: z.array(z.string().max(200)).max(20).optional(),
    inputType: z.enum(["text", "select", "date", "email", "number", "textarea"]).optional(), options: z.array(z.string().max(200)).max(20).optional(),
    monthLabel: z.string().max(100).optional(), startWeekday: z.number().int().min(0).max(6).optional(), selectedDay: z.number().int().min(1).max(31).optional(), slots: z.array(z.string().max(100)).max(12).optional(),
  }).strict().optional(),
  actions: z.array(z.object({ label: text, action: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict()).max(10).optional(),
  children: z.array(element).max(200).optional(),
}).strict());
// Inspect resource limits before the recursive schema so hostile trees cannot exhaust the stack.
export const mockupDocumentSchema = z.unknown().superRefine((value, context) => {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }]; let count = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (current.depth > 24 || ++count > 5000) { context.addIssue({ code: "custom", message: "Mockup ületab lubatud mahu või sügavuse." }); return; }
    if (current.value && typeof current.value === "object") for (const child of Object.values(current.value)) if (child && typeof child === "object") pending.push({ value: child, depth: current.depth + 1 });
  }
}).pipe(z.object({ schemaVersion: z.literal(1), screenName: z.string().trim().min(1).max(200), description: text.optional(), canvas: z.object({ width: z.number().int().min(320).max(1440), height: z.number().int().min(480).max(4000) }).strict().optional(), elements: z.array(element).max(200) }).strict()).superRefine((document, context) => {
  const ids = new Set<string>(); let count = 0;
  const walk = (elements: MockupElement[], depth: number) => {
    for (const item of elements) {
      if (ids.has(item.id)) context.addIssue({ code: "custom", message: `Korduv elemendi ID: ${item.id}` });
      ids.add(item.id); count++;
      if (depth > 5) context.addIssue({ code: "custom", message: "Mockup võib sisaldada kuni kuut elemenditaset." });
      if (item.children) walk(item.children, depth + 1);
    }
  };
  walk(document.elements, 0);
  if (count > 200) context.addIssue({ code: "custom", message: "Mockup võib sisaldada kuni 200 elementi." });
});
export function parseMockup(json?: string): MockupDocument | null {
  try { const result = mockupDocumentSchema.safeParse(JSON.parse(json ?? "null")); return result.success ? result.data : null; } catch { return null; }
}
export const emptyMockup: MockupDocument = { schemaVersion: 1, screenName: "Mockup eemaldatud", elements: [] };

// UI metadata for the visual builder: which types the renderer actually draws as containers (see renderer.tsx's
// switch - heading/button/field/image_placeholder render a fixed body and ignore children), and starter content
// so a freshly added element isn't a blank box.
export type ElementType = typeof elementTypes[number];
export const elementTypeLabels: Record<ElementType, string> = {
  heading: "Pealkiri", text: "Tekst", image_placeholder: "Pildi koht", card: "Kaart", list: "Loend", form: "Vorm",
  field: "Väli", button: "Nupp", navigation: "Navigatsioon", table: "Tabel", calendar: "Kalender", alert: "Hoiatus", confirmation: "Kinnitus", container: "Konteiner",
};
export const containerTypes: ReadonlySet<ElementType> = new Set(["text", "card", "list", "form", "navigation", "table", "alert", "confirmation", "container"]);
export function canHaveChildren(type: ElementType) { return containerTypes.has(type); }
let counter = 0;
export function generateElementId(type: ElementType, taken: ReadonlySet<string>) {
  let id = `${type}-${(++counter).toString(36)}`;
  while (taken.has(id)) id = `${type}-${(++counter).toString(36)}`;
  return id;
}
export function collectIds(elements: MockupElement[], into = new Set<string>()) {
  for (const element of elements) { into.add(element.id); if (element.children) collectIds(element.children, into); }
  return into;
}
export function createMockupElement(type: ElementType, taken: ReadonlySet<string>): MockupElement {
  const id = generateElementId(type, taken);
  const base: MockupElement = { id, type };
  switch (type) {
    case "heading": return { ...base, text: "Pealkiri" };
    case "text": return { ...base, text: "Tekst" };
    case "button": return { ...base, label: "Nupp" };
    case "field": return { ...base, label: "Väli", props: { placeholder: "" } };
    case "calendar": return { ...base, label: "Vali kuupäev", props: { monthLabel: "Kuu vaade", selectedDay: 15, slots: ["09:00", "10:30", "13:00", "14:30"] } };
    case "table": return { ...base, label: "Ülevaade", props: { columns: 3, headers: ["Nimetus", "Staatus", "Tegevus"], rows: [["Näidis 1", "Kinnitatud", "Vaata"], ["Näidis 2", "Ootel", "Vaata"], ["Näidis 3", "Kinnitatud", "Vaata"]] } };
    case "image_placeholder": return { ...base, label: "Pildi koht" };
    case "list": return { ...base, children: [] };
    default: return { ...base, label: elementTypeLabels[type] };
  }
}
export function findElement(elements: MockupElement[], id: string): MockupElement | undefined {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.children) { const found = findElement(element.children, id); if (found) return found; }
  }
  return undefined;
}
export function removeElement(elements: MockupElement[], id: string): { elements: MockupElement[]; removed?: MockupElement } {
  let removed: MockupElement | undefined;
  const next: MockupElement[] = [];
  for (const element of elements) {
    if (element.id === id) { removed = element; continue; }
    if (removed) { next.push(element); continue; }
    if (element.children) {
      const result = removeElement(element.children, id);
      if (result.removed) { removed = result.removed; next.push({ ...element, children: result.elements }); continue; }
    }
    next.push(element);
  }
  return { elements: next, removed };
}
export function insertElement(elements: MockupElement[], parentId: string | null, index: number, element: MockupElement): MockupElement[] {
  if (parentId === null) { const copy = [...elements]; copy.splice(index, 0, element); return copy; }
  return elements.map(item => {
    if (item.id === parentId) { const children = [...(item.children ?? [])]; children.splice(index, 0, element); return { ...item, children }; }
    return item.children ? { ...item, children: insertElement(item.children, parentId, index, element) } : item;
  });
}
export function updateElement(elements: MockupElement[], id: string, patch: Partial<MockupElement>): MockupElement[] {
  return elements.map(item => item.id === id ? { ...item, ...patch } : item.children ? { ...item, children: updateElement(item.children, id, patch) } : item);
}
/** True if `ancestorId` is `id` itself or contains it - used to forbid dragging a container into its own subtree. */
export function isSelfOrDescendant(element: MockupElement, id: string): boolean {
  if (element.id === id) return true;
  return element.children?.some(child => isSelfOrDescendant(child, id)) ?? false;
}
export const mockupFixtures: Record<string, MockupDocument> = {
  booking: { schemaVersion: 1, screenName: "Treeningu broneerimine", description: "Liige valib treeningu ja kinnitab broneeringu.", elements: [
    { id: "title", type: "heading", text: "Broneeri treening" }, { id: "navigation", type: "navigation", actions: [{ label: "Treeningud", action: "trainings" }] },
    { id: "booking-form", type: "form", children: [{ id: "training", type: "field", label: "Treening", props: { placeholder: "Vali treening", required: true } }, { id: "book", type: "button", label: "Kinnita broneering" }] },
    { id: "confirmation", type: "confirmation", text: "Broneering kinnitatud" },
  ] },
  overview: { schemaVersion: 1, screenName: "Broneeringute ülevaade", elements: [{ id: "title", type: "heading", text: "Minu broneeringud" }, { id: "bookings", type: "table", children: [{ id: "booking-card", type: "card", label: "Jooga", children: [{ id: "booking-time", type: "text", text: "Esmaspäev 18:00" }] }] }, { id: "notice", type: "alert", text: "Tühistamine on võimalik 24 tundi enne algust." }, { id: "image", type: "image_placeholder", label: "Treeningu pilt" }] },
};
