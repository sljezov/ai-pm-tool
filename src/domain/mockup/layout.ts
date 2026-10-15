import { canHaveChildren, type ElementLayout, type MockupDocument, type MockupElement } from "./document";
import { isCalendarElement, minimumElementHeight } from "./presentation";

export function defaultLayout(element: MockupElement, index: number, width: number): ElementLayout {
  const detailed = isCalendarElement(element) || element.type === "table";
  const height = isCalendarElement(element) ? 400 : element.type === "table" ? 280 : element.type === "list" ? 224 : element.type === "card" ? 192 : element.type === "form" && !element.children?.length ? 280 : element.type === "image_placeholder" ? 144 : 96;
  return element.layout ?? { x: 24, y: 24 + index * 152, width: Math.max(48, Math.min(width - 48, element.type === "button" ? 200 : detailed ? 640 : 420)), height };
}

/** Gives old component trees the same editable geometry as AI-created drawings, retaining IDs and nesting. */
export function prepareCanvas(document: MockupDocument): MockupDocument {
  const width = document.canvas?.width ?? 768;
  function arrange(elements: MockupElement[], availableWidth: number, startY: number): MockupElement[] {
    let nextY = startY;
    const arranged = elements.map((element, index) => {
      const base = element.layout ?? { ...defaultLayout(element, index, availableWidth), x: startY === 24 ? 24 : 16, y: nextY };
      const layout = { ...base };
      layout.height = Math.min(4000, Math.max(layout.height, minimumElementHeight(element, layout.width)));
      const children = element.children && canHaveChildren(element.type) ? arrange(element.children, layout.width, element.label || element.text ? 56 : 16) : element.children;
      if (children?.length) layout.height = Math.min(4000, Math.max(layout.height, ...children.map(child => child.layout ? child.layout.y + child.layout.height + 16 : 0)));
      nextY = Math.max(nextY, layout.y + layout.height + 24);
      return { ...element, layout, ...(children ? { children } : {}) };
    });
    // Preserve side-by-side rows and their gaps when fitting a taller field or widget.
    const groups = new Map<number, number[]>();
    arranged.forEach((element, index) => { const y = element.layout!.y; groups.set(y, [...(groups.get(y) ?? []), index]); });
    let oldBottom = -1; let newBottom = -1;
    for (const [y, indexes] of [...groups.entries()].sort(([a], [b]) => a - b)) {
      const nextY = oldBottom <= y ? Math.max(y, newBottom + y - oldBottom) : y;
      const originalBottom = Math.max(...indexes.map(index => y + (elements[index].layout?.height ?? arranged[index].layout!.height)));
      indexes.forEach(index => { arranged[index].layout!.y = nextY; });
      oldBottom = originalBottom;
      newBottom = Math.max(...indexes.map(index => nextY + arranged[index].layout!.height));
    }
    return arranged;
  }
  const elements = arrange(document.elements, width, 24);
  const bottom = Math.max(480, ...elements.map(element => element.layout!.y + element.layout!.height + 24));
  return { ...document, canvas: { width, height: Math.min(4000, Math.max(document.canvas?.height ?? 960, bottom)) }, elements };
}
