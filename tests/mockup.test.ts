import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mockupDocumentSchema, mockupFixtures, type MockupElement } from "@/domain/mockup/document";
import { MockupRenderer } from "@/components/mockup/renderer";
import { prepareCanvas } from "@/domain/mockup/layout";
import { calendarPeriod } from "@/domain/mockup/presentation";
const document = (element: unknown) => ({ schemaVersion: 1, screenName: "Test", elements: [element] });
describe("safe mockups", () => {
  it("aligns named calendar months and respects leap years and explicit weekday overrides", () => {
    expect(calendarPeriod({ id: "calendar", type: "calendar", props: { monthLabel: "Veebruar 2024" } }).days).toBe(29);
    expect(calendarPeriod({ id: "calendar", type: "calendar", props: { monthLabel: "Veebruar 2026" } }).days).toBe(28);
    expect(calendarPeriod({ id: "calendar", type: "calendar", props: { monthLabel: "Oktoober 2026" } }).offset).toBe(3);
    expect(calendarPeriod({ id: "calendar", type: "calendar", props: { monthLabel: "Oktoober 2026", startWeekday: 0 } }).offset).toBe(0);
  });
  it("renders real table cells, calendar days and dropdowns, including legacy calendar tables", () => {
    const table = renderToStaticMarkup(createElement(MockupRenderer, { document: document({ id: "services", type: "table", props: { headers: ["Teenus", "Kestus"], rows: [["Juukselõikus", "30 min"]] } }) }));
    expect(table).toContain("<table>"); expect(table).toContain("<th>Teenus</th>"); expect(table).toContain("<td>Juukselõikus</td>");
    for (const type of ["calendar", "table"]) {
      const calendar = renderToStaticMarkup(createElement(MockupRenderer, { document: document({ id: "calendar_view", type, label: "Vabad ajad", props: { monthLabel: "Oktoober", slots: ["11:00"] } }) }));
      expect(calendar).toContain("Kalendri päevad"); expect(calendar).toContain("Oktoober"); expect(calendar).toContain("11:00");
      expect(calendar.match(/class="wire-calendar-day/g)).toHaveLength(31);
    }
    const field = renderToStaticMarkup(createElement(MockupRenderer, { document: document({ id: "service_select", type: "field", label: "Teenus", props: { placeholder: "Vali teenus", options: ["Juukselõikus", "Värvimine"] } }) }));
    expect(field).toContain("<select"); expect(field).toContain("Värvimine");
  });
  it("fits undersized AI fields and shifts later rows while preserving side-by-side positions", () => {
    const input = { schemaVersion: 1 as const, screenName: "Broneeri", canvas: { width: 1200, height: 960 }, elements: [
      { id: "service_select", type: "field" as const, label: "Teenus", layout: { x: 32, y: 32, width: 300, height: 48 } },
      { id: "master_select", type: "field" as const, label: "Meister", layout: { x: 352, y: 32, width: 300, height: 48 } },
      { id: "calendar_view", type: "table" as const, layout: { x: 32, y: 100, width: 960, height: 480 } },
    ] };
    const drawing = prepareCanvas(input);
    expect(input.elements[0].layout.height).toBe(48);
    expect(drawing.elements[0].layout).toMatchObject({ x: 32, y: 32, height: 92 });
    expect(drawing.elements[1].layout).toMatchObject({ x: 352, y: 32, height: 92 });
    expect(drawing.elements[2].layout!.y).toBeGreaterThanOrEqual(124);
    expect(prepareCanvas(drawing)).toEqual(drawing);
  });
  it("bounds structured widget content and escapes supplied table cells", () => {
    for (const props of [{ headers: Array(7).fill("x") }, { rows: Array(21).fill(["x"]) }, { selectedDay: 32 }, { startWeekday: -1 }, { inputType: "script" }]) expect(mockupDocumentSchema.safeParse(document({ id: "a", type: "table", props })).success).toBe(false);
    const html = renderToStaticMarkup(createElement(MockupRenderer, { document: document({ id: "a", type: "table", props: { headers: ["Sisu"], rows: [["<script>alert(1)</script>"]] } }) }));
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });
  it("keeps list labels, descriptions and empty elements visible", () => {
    const html = renderToStaticMarkup(createElement(MockupRenderer, { document: document({ id: "calendar", type: "list", label: "Vabad ajad", text: "Vali sobiv aeg", children: [] }) }));
    expect(html).toContain("Vabad ajad"); expect(html).toContain("Vali sobiv aeg");
    expect(renderToStaticMarkup(createElement(MockupRenderer, { document: document({ id: "empty-list", type: "list" }) }))).toContain("mockup-empty-label");
  });
  it("turns legacy AI component trees into editable drawings without losing IDs or mutating history", () => {
    const original = structuredClone(mockupFixtures.booking);
    const drawing = prepareCanvas(original);
    expect(original).toEqual(mockupFixtures.booking);
    expect(drawing.canvas).toEqual({ width: 768, height: 960 });
    const form = drawing.elements.find(element => element.id === "booking-form")!;
    expect(form.children?.map(child => child.id)).toEqual(["training", "book"]);
    for (const child of form.children!) {
      expect(child.layout).toBeDefined();
      expect(child.layout!.x + child.layout!.width).toBeLessThanOrEqual(form.layout!.width);
      expect(child.layout!.y + child.layout!.height).toBeLessThanOrEqual(form.layout!.height);
    }
    expect(prepareCanvas(drawing)).toEqual(drawing);
    expect(mockupDocumentSchema.safeParse(drawing).success).toBe(true);
  });
  it("persists bounded wireframe coordinates and rejects unsafe geometry", () => {
    const element = { id: "button", type: "button", layout: { x: 64, y: 80, width: 200, height: 48 } };
    expect(mockupDocumentSchema.parse({ ...document(element), canvas: { width: 375, height: 960 } }).elements[0].layout).toEqual(element.layout);
    for (const layout of [{ ...element.layout, x: -1 }, { ...element.layout, width: 100000 }, { ...element.layout, y: Infinity }, { ...element.layout, position: "fixed" }]) expect(mockupDocumentSchema.safeParse(document({ ...element, layout })).success).toBe(false);
  });
  it("rejects executable properties, unknown types, URLs and arbitrary actions", () => {
    for (const element of [{ id: "a", type: "iframe" }, { id: "a", type: "button", onClick: "alert(1)" }, { id: "a", type: "text", props: { style: "color:red" } }, { id: "a", type: "image_placeholder", props: { src: "javascript:alert(1)" } }, { id: "a", type: "button", actions: [{ label: "Run", action: "javascript:alert(1)" }] }]) expect(mockupDocumentSchema.safeParse(document(element)).success).toBe(false);
  });
  it("rejects duplicate IDs, deep trees, excessive counts and long text", () => {
    expect(mockupDocumentSchema.safeParse({ ...document({ id: "a", type: "text" }), elements: [{ id: "a", type: "text" }, { id: "a", type: "text" }] }).success).toBe(false);
    let element: MockupElement = { id: "leaf", type: "text" }; for (let n = 0; n < 100; n++) element = { id: `parent-${n}`, type: "container", children: [element] };
    expect(mockupDocumentSchema.safeParse(document(element)).success).toBe(false);
    expect(mockupDocumentSchema.safeParse({ ...document({}), elements: Array.from({ length: 201 }, (_, n) => ({ id: `a${n}`, type: "text" })) }).success).toBe(false);
    expect(mockupDocumentSchema.safeParse(document({ id: "a", type: "text", text: "a".repeat(2001) })).success).toBe(false);
  });
  it("renders text literally and rejects invalid documents before rendering", () => {
    const html = renderToStaticMarkup(createElement(MockupRenderer, { document: document({ id: "a", type: "text", text: '<script>alert(1)</script><img src=x onerror=alert(1)>' }) }));
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("<img");
    expect(renderToStaticMarkup(createElement(MockupRenderer, { document: document({ id: "a", type: "iframe" }) }))).toContain("struktuur on vigane");
    for (const fixture of Object.values(mockupFixtures)) expect(renderToStaticMarkup(createElement(MockupRenderer, { document: fixture }))).toContain(fixture.screenName);
  });
});
