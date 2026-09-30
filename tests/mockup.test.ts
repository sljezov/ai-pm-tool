import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mockupDocumentSchema, mockupFixtures, type MockupElement } from "@/domain/mockup/document";
import { MockupRenderer } from "@/components/mockup/renderer";
const document = (element: unknown) => ({ schemaVersion: 1, screenName: "Test", elements: [element] });
describe("safe mockups", () => {
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
