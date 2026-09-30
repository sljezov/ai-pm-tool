import { z } from "zod";

export const elementTypes = ["heading", "text", "image_placeholder", "card", "list", "form", "field", "button", "navigation", "table", "alert", "confirmation", "container"] as const;
export type MockupElement = { id: string; type: typeof elementTypes[number]; label?: string; text?: string; props?: { required?: boolean; disabled?: boolean; placeholder?: string; columns?: number }; actions?: { label: string; action: string }[]; children?: MockupElement[] };
export type MockupDocument = { schemaVersion: 1; screenName: string; description?: string; elements: MockupElement[] };
const text = z.string().max(2000);
const element: z.ZodType<MockupElement> = z.lazy(() => z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), type: z.enum(elementTypes), label: text.optional(), text: text.optional(),
  props: z.object({ required: z.boolean().optional(), disabled: z.boolean().optional(), placeholder: z.string().max(200).optional(), columns: z.number().int().min(1).max(6).optional() }).strict().optional(),
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
}).pipe(z.object({ schemaVersion: z.literal(1), screenName: z.string().trim().min(1).max(200), description: text.optional(), elements: z.array(element).max(200) }).strict()).superRefine((document, context) => {
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
export const mockupFixtures: Record<string, MockupDocument> = {
  booking: { schemaVersion: 1, screenName: "Treeningu broneerimine", description: "Liige valib treeningu ja kinnitab broneeringu.", elements: [
    { id: "title", type: "heading", text: "Broneeri treening" }, { id: "navigation", type: "navigation", actions: [{ label: "Treeningud", action: "trainings" }] },
    { id: "booking-form", type: "form", children: [{ id: "training", type: "field", label: "Treening", props: { placeholder: "Vali treening", required: true } }, { id: "book", type: "button", label: "Kinnita broneering" }] },
    { id: "confirmation", type: "confirmation", text: "Broneering kinnitatud" },
  ] },
  overview: { schemaVersion: 1, screenName: "Broneeringute ülevaade", elements: [{ id: "title", type: "heading", text: "Minu broneeringud" }, { id: "bookings", type: "table", children: [{ id: "booking-card", type: "card", label: "Jooga", children: [{ id: "booking-time", type: "text", text: "Esmaspäev 18:00" }] }] }, { id: "notice", type: "alert", text: "Tühistamine on võimalik 24 tundi enne algust." }, { id: "image", type: "image_placeholder", label: "Treeningu pilt" }] },
};
