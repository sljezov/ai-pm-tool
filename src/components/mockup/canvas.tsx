"use client";

import { useRef, useState, type PointerEvent } from "react";
import { type ElementLayout, type MockupDocument, type MockupElement } from "@/domain/mockup/document";
import { defaultLayout } from "@/domain/mockup/layout";
import { MockupElementView } from "./renderer";

type Gesture = { id: string; mode: "move" | "resize"; startX: number; startY: number; layout: ElementLayout; scale: number; width: number; height: number };

export function WireframeCanvas({ document, selectedId, busy, dragging, onSelect, onChange, onDrop }: {
  document: MockupDocument; selectedId: string | null; busy: boolean; dragging: boolean;
  onSelect: (id: string | null) => void; onChange: (id: string, layout: ElementLayout) => void;
  onDrop: (x: number, y: number) => void;
}) {
  const plane = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<{ id: string; layout: ElementLayout } | null>(null);
  const [over, setOver] = useState(false);
  const width = document.canvas?.width ?? 768;
  const height = document.canvas?.height ?? 960;
  function start(event: PointerEvent<HTMLElement>, element: MockupElement, mode: Gesture["mode"], parentWidth: number, parentHeight: number) {
    if (busy || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    onSelect(element.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const layout = defaultLayout(element, document.elements.indexOf(element), width);
    gesture.current = { id: element.id, mode, startX: event.clientX, startY: event.clientY, layout, scale: (plane.current?.getBoundingClientRect().width ?? width) / width, width: parentWidth, height: parentHeight };
    setDraft({ id: element.id, layout });
  }
  function nextLayout(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current) return null;
    const dx = (event.clientX - current.startX) / current.scale;
    const dy = (event.clientY - current.startY) / current.scale;
    // A click must preserve AI-authored coordinates, including positions between grid lines.
    // Snapping on pointer-up can move the element out from under the click and clear its selection.
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return { id: current.id, layout: current.layout };
    const snap = (value: number) => Math.round(value / 8) * 8;
    const layout = current.mode === "move"
      ? { ...current.layout, x: Math.max(0, Math.min(current.width - current.layout.width, snap(current.layout.x + dx))), y: Math.max(0, Math.min(current.height - current.layout.height, snap(current.layout.y + dy))) }
      : { ...current.layout, width: Math.max(48, Math.min(current.width - current.layout.x, snap(current.layout.width + dx))), height: Math.max(32, Math.min(current.height - current.layout.y, snap(current.layout.height + dy))) };
    return { id: current.id, layout };
  }
  function move(event: PointerEvent<HTMLElement>) { event.stopPropagation(); const next = nextLayout(event); if (next) setDraft(next); }
  function finish(event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
    const next = nextLayout(event);
    if (next) onChange(next.id, next.layout);
    gesture.current = null; setDraft(null);
  }
  function cancel() { gesture.current = null; setDraft(null); }
  function renderElements(elements: MockupElement[], parentWidth: number, parentHeight: number) {
    return elements.map((element, index) => {
      const layout = draft?.id === element.id ? draft.layout : defaultLayout(element, index, parentWidth);
      return <div key={element.id} tabIndex={0} data-canvas-element-id={element.id} className={`wireframe-item wireframe-type-${element.type}${selectedId === element.id ? " selected" : ""}`} style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height }}
        onClick={event => { event.stopPropagation(); onSelect(element.id); }}
        onPointerDown={event => start(event, element, "move", parentWidth, parentHeight)} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel}>
        <button type="button" className="wireframe-move" aria-label={`Liiguta ${element.label || element.text || element.id}`} disabled={busy} onPointerDown={event => start(event, element, "move", parentWidth, parentHeight)}>⠿</button>
        <div className="wireframe-content"><MockupElementView element={{ ...element, layout: undefined, children: undefined }} showEmptyPlaceholder={!element.children?.length} /></div>
        {element.children && renderElements(element.children, layout.width, layout.height)}
        {selectedId === element.id && <button type="button" className="wireframe-resize" aria-label="Muuda elemendi suurust" disabled={busy} onPointerDown={event => start(event, element, "resize", parentWidth, parentHeight)} />}
      </div>;
    });
  }
  return <div className="wireframe-scroll">
    <div className="wireframe-browser"><span aria-hidden="true">● ● ●</span><span>{document.screenName}</span><span>{width} px</span></div>
    <div ref={plane} className={`wireframe-plane${over && dragging ? " drop-active" : ""}`} aria-label="Wireframe tööpind"
      style={{ width, height }} onClick={() => onSelect(null)}
      onDragOver={event => { if (!busy && dragging) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setOver(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); setOver(false); if (busy || !dragging) return; const bounds = event.currentTarget.getBoundingClientRect(); onDrop(Math.max(0, Math.round((event.clientX - bounds.left) * width / bounds.width / 8) * 8), Math.max(0, Math.round((event.clientY - bounds.top) * height / bounds.height / 8) * 8)); }}>
      {!document.elements.length && <p className="wireframe-empty">Lohista siia pealkiri, väli, nupp või kaart.</p>}
      {renderElements(document.elements, width, height)}
    </div>
  </div>;
}
