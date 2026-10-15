"use client";
import { useEffect, useMemo, useState, type SetStateAction } from "react";
import {
  mockupFixtures, mockupDocumentSchema, parseMockup, elementTypes, elementTypeLabels, canHaveChildren,
  createMockupElement, collectIds, findElement, removeElement, insertElement, updateElement, isSelfOrDescendant,
  type MockupDocument, type MockupElement, type ElementType,
} from "@/domain/mockup/document";
import { MockupRenderer } from "./renderer";
import { WireframeCanvas } from "./canvas";
import { prepareCanvas, defaultLayout } from "@/domain/mockup/layout";
import { calendarPeriod, fieldInputType, isCalendarElement } from "@/domain/mockup/presentation";

type Version = { id: string; version: number; name: string; structureJson: string; source: string; createdAt: Date };
type DragPayload = { kind: "new"; elementType: ElementType } | { kind: "move"; id: string } | null;

function resolveIndex(elements: MockupElement[], parentId: string | null, beforeId: string | null) {
  const siblings = parentId === null ? elements : (findElement(elements, parentId)?.children ?? []);
  if (beforeId === null) return siblings.length;
  const index = siblings.findIndex(item => item.id === beforeId);
  return index === -1 ? siblings.length : index;
}

function DropStrip({ parentId, beforeId, onDrop }: { parentId: string | null; beforeId: string | null; onDrop: (parentId: string | null, beforeId: string | null) => void }) {
  return <div className="mockup-drop-strip" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); onDrop(parentId, beforeId); }} />;
}

function OutlineList({ elements, parentId, selectedId, draggingId, onSelect, onDrop, onDragStart, onDragEnd, onDelete }: {
  elements: MockupElement[]; parentId: string | null; selectedId: string | null; draggingId: string | null;
  onSelect: (id: string) => void; onDrop: (parentId: string | null, beforeId: string | null) => void; onDragStart: (id: string) => void; onDragEnd: () => void; onDelete: (id: string) => void;
}) {
  return <ul className="outline-list">
    {elements.map(element => <li key={element.id}>
      <DropStrip parentId={parentId} beforeId={element.id} onDrop={onDrop} />
      <OutlineRow element={element} parentId={parentId} selectedId={selectedId} draggingId={draggingId} onSelect={onSelect} onDrop={onDrop} onDragStart={onDragStart} onDragEnd={onDragEnd} onDelete={onDelete} />
    </li>)}
    <DropStrip parentId={parentId} beforeId={null} onDrop={onDrop} />
  </ul>;
}

function OutlineRow({ element, selectedId, draggingId, onSelect, onDrop, onDragStart, onDragEnd, onDelete }: {
  element: MockupElement; parentId: string | null; selectedId: string | null; draggingId: string | null;
  onSelect: (id: string) => void; onDrop: (parentId: string | null, beforeId: string | null) => void; onDragStart: (id: string) => void; onDragEnd: () => void; onDelete: (id: string) => void;
}) {
  const container = canHaveChildren(element.type);
  return <div>
    <div className={`outline-row${selectedId === element.id ? " selected" : ""}${draggingId === element.id ? " dragging" : ""}`}
      draggable tabIndex={0}
      onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData("text/plain", element.id); event.dataTransfer.effectAllowed = "move"; onDragStart(element.id); }}
      onDragEnd={onDragEnd}
      onClick={event => { event.currentTarget.focus({ preventScroll: true }); onSelect(element.id); }}
      onDragOver={event => { if (container) event.preventDefault(); }}
      onDrop={event => { if (!container) return; event.preventDefault(); event.stopPropagation(); onDrop(element.id, null); }}>
      <span className="outline-handle" aria-hidden="true">⠿</span>
      <span className="outline-type">{elementTypeLabels[element.type]}</span>
      <span className="outline-text">{element.label || element.text || (container ? "" : "—")}</span>
      <button type="button" className="outline-delete" aria-label={`Kustuta ${elementTypeLabels[element.type]}`} onClick={event => { event.stopPropagation(); onDelete(element.id); }}>✕</button>
    </div>
    {container && <OutlineList elements={element.children ?? []} parentId={element.id} selectedId={selectedId} draggingId={draggingId} onSelect={onSelect} onDrop={onDrop} onDragStart={onDragStart} onDragEnd={onDragEnd} onDelete={onDelete} />}
  </div>;
}

function ActionsEditor({ actions, onChange }: { actions: { label: string; action: string }[]; onChange: (actions: { label: string; action: string }[]) => void }) {
  return <div className="mockup-actions-editor"><p className="muted">Nupud / tegevused</p>
    {actions.map((item, index) => <div className="form-row" key={index}>
      <input aria-label={`Tegevuse ${index + 1} silt`} placeholder="Silt" maxLength={200} value={item.label} onChange={event => onChange(actions.map((a, i) => i === index ? { ...a, label: event.target.value } : a))} />
      <button type="button" onClick={() => onChange(actions.filter((_, i) => i !== index))}>Kustuta</button>
    </div>)}
    <button type="button" onClick={() => onChange([...actions, { label: "Nupp", action: `action-${actions.length + 1}` }])}>Lisa tegevus</button>
  </div>;
}

function PropertyPanel({ element, onChange, onDelete }: { element: MockupElement; onChange: (patch: Partial<MockupElement>) => void; onDelete: () => void }) {
  const isList = element.type === "list";
  const isLeafText = element.type === "field" || element.type === "button" || element.type === "image_placeholder";
  return <div className="mockup-properties" aria-label="Valitud elemendi omadused">
    <h4>{elementTypeLabels[element.type]}</h4>
    {element.layout && <div className="form-row">{(["x", "y", "width", "height"] as const).map(key => <label key={key}>{({ x: "X", y: "Y", width: "Laius", height: "Kõrgus" })[key]}<input type="number" min={key === "width" ? 48 : key === "height" ? 32 : 0} max={key === "width" ? 1440 : 4000} value={element.layout![key]} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= (key === "width" ? 48 : key === "height" ? 32 : 0) && value <= (key === "width" ? 1440 : 4000)) onChange({ layout: { ...element.layout!, [key]: value } }); }} /></label>)}</div>}
    {<label>Silt<input maxLength={2000} value={element.label ?? ""} onChange={event => onChange({ label: event.target.value || undefined })} /></label>}
    {!isLeafText && <label>Tekst<textarea rows={2} maxLength={2000} value={element.text ?? ""} onChange={event => onChange({ text: event.target.value || undefined })} /></label>}
    {element.type === "field" && <label>Kohatäite tekst<input maxLength={200} value={element.props?.placeholder ?? ""} onChange={event => onChange({ props: { ...element.props, placeholder: event.target.value || undefined } })} /></label>}
    {element.type === "field" && <><label>Välja tüüp<select value={fieldInputType(element)} onChange={event => onChange({ props: { ...element.props, inputType: event.target.value as "text" | "select" | "date" | "email" | "number" | "textarea" } })}><option value="text">Tekst</option><option value="select">Rippmenüü</option><option value="date">Kuupäev</option><option value="email">E-post</option><option value="number">Arv</option><option value="textarea">Pikem tekst</option></select></label>{fieldInputType(element) === "select" && <label>Valikud (üks real)<textarea rows={3} maxLength={4000} value={(element.props?.options ?? []).join("\n")} onChange={event => onChange({ props: { ...element.props, options: event.target.value.split("\n").slice(0, 20).map(value => value.slice(0, 200)) } })} /></label>}</>}
    {element.type === "field" && <label className="checkbox-label"><input type="checkbox" checked={!!element.props?.required} onChange={event => onChange({ props: { ...element.props, required: event.target.checked || undefined } })} />Kohustuslik</label>}
    {element.type === "table" && <label>Veergude arv<input type="number" min={1} max={6} value={element.props?.columns ?? ""} onChange={event => onChange({ props: { ...element.props, columns: event.target.value ? Number(event.target.value) : undefined } })} /></label>}
    {element.type === "table" && <label>Vaate tüüp<select value={isCalendarElement(element) ? "calendar" : "table"} onChange={event => onChange({ props: { ...element.props, variant: event.target.value as "table" | "calendar" } })}><option value="table">Tabel</option><option value="calendar">Kalender</option></select></label>}
    {element.type === "table" && !isCalendarElement(element) && <><label>Veergude pealkirjad (üks real)<textarea rows={3} maxLength={1200} value={(element.props?.headers ?? []).join("\n")} onChange={event => onChange({ props: { ...element.props, headers: event.target.value.split("\n").slice(0, 6).map(value => value.slice(0, 200)) } })} /></label><label>Tabeli read (veerud eralda | märgiga)<textarea rows={4} maxLength={12000} value={(element.props?.rows ?? []).map(row => row.join("|")).join("\n")} onChange={event => onChange({ props: { ...element.props, rows: event.target.value.split("\n").slice(0, 20).map(row => row.split("|").slice(0, 6).map(value => value.slice(0, 200))) } })} /></label></>}
    {isCalendarElement(element) && <><label>Kuu pealkiri<input maxLength={100} value={element.props?.monthLabel ?? ""} onChange={event => onChange({ props: { ...element.props, monthLabel: event.target.value } })} /></label><label>Valitud päev<input type="number" min={1} max={31} value={element.props?.selectedDay ?? 15} onChange={event => { const value = Number(event.target.value); if (value >= 1 && value <= 31) onChange({ props: { ...element.props, selectedDay: value } }); }} /></label><label>Kuu esimene nädalapäev<select value={calendarPeriod(element).offset} onChange={event => onChange({ props: { ...element.props, startWeekday: Number(event.target.value) } })}>{["Esmaspäev", "Teisipäev", "Kolmapäev", "Neljapäev", "Reede", "Laupäev", "Pühapäev"].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Ajavalikud (üks real)<textarea rows={3} maxLength={1200} value={(element.props?.slots ?? ["09:00", "10:30", "13:00", "14:30"]).join("\n")} onChange={event => onChange({ props: { ...element.props, slots: event.target.value ? event.target.value.split("\n").slice(0, 12).map(value => value.slice(0, 100)) : [] } })} /></label></>}
    {element.type === "list" && <label>Loendi read (üks real)<textarea rows={4} maxLength={4000} value={(element.props?.items ?? ["Loendi element 1", "Loendi element 2", "Loendi element 3"]).join("\n")} onChange={event => onChange({ props: { ...element.props, items: event.target.value.split("\n").slice(0, 20).map(value => value.slice(0, 200)) } })} /></label>}
    {(element.type === "button" || element.type === "field") && <label className="checkbox-label"><input type="checkbox" checked={!!element.props?.disabled} onChange={event => onChange({ props: { ...element.props, disabled: event.target.checked || undefined } })} />Mitteaktiivne</label>}
    {canHaveChildren(element.type) && !isList && <ActionsEditor actions={element.actions ?? []} onChange={actions => onChange({ actions: actions.length ? actions : undefined })} />}
    <button type="button" className="text-button-danger" onClick={onDelete}>Kustuta element</button>
  </div>;
}

export function MockupEditor({ storyId, versions = [], busy, mutate, initialDocument, onDocumentChange }: { storyId?: string; versions?: Version[]; busy: boolean; mutate?: (command: Record<string, unknown>) => Promise<boolean>; initialDocument?: MockupDocument; onDocumentChange?: (document: MockupDocument) => void }) {
  const [selected, setSelected] = useState(versions[0]?.id ?? "");
  const [history, setHistory] = useState<{ past: MockupDocument[]; present: MockupDocument; future: MockupDocument[] }>(() => ({ past: [], present: prepareCanvas(initialDocument ?? parseMockup(versions[0]?.structureJson) ?? mockupFixtures.booking), future: [] }));
  const doc = useMemo(() => prepareCanvas(history.present), [history.present]);
  const draftMode = !!onDocumentChange;
  useEffect(() => { onDocumentChange?.(doc); }, [doc, onDocumentChange]);
  function setDoc(action: SetStateAction<MockupDocument>) {
    setHistory(current => {
      const present = prepareCanvas(current.present);
      const next = prepareCanvas(typeof action === "function" ? action(present) : action);
      if (JSON.stringify(next) === JSON.stringify(present)) return current;
      return { past: [...current.past.slice(-49), present], present: next, future: [] };
    });
  }
  const [name, setName] = useState(versions[0]?.name ?? "Treeningu broneerimine");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragPayload, setDragPayload] = useState<DragPayload>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const version = versions.find(item => item.id === selected) ?? versions[0];
  const selectedElement = selectedId ? findElement(doc.elements, selectedId) : undefined;

  function patchDoc(patch: Partial<MockupDocument>) { setDoc(current => ({ ...current, ...patch })); }
  function addElement(type: ElementType) {
    const taken = collectIds(doc.elements);
    const element = createMockupElement(type, taken);
    const parent = selectedId ? findElement(doc.elements, selectedId) : undefined;
    const parentId = parent && canHaveChildren(parent.type) ? parent.id : null;
    if (parentId === null) element.layout = { ...defaultLayout(element, 0, doc.canvas!.width), y: Math.max(0, ...doc.elements.map(item => (item.layout?.y ?? 0) + (item.layout?.height ?? 96))) + 24 };
    setDoc(current => prepareCanvas({ ...current, elements: insertElement(current.elements, parentId, resolveIndex(current.elements, parentId, null), element) }));
    setSelectedId(element.id);
  }
  function deleteElement(id: string) {
    setDoc(current => ({ ...current, elements: removeElement(current.elements, id).elements }));
    if (selectedId === id) setSelectedId(null);
  }
  function patchElement(id: string, patch: Partial<MockupElement>) {
    setDoc(current => {
      const next = { ...current, elements: updateElement(current.elements, id, patch) };
      return patch.props || patch.text !== undefined || patch.label !== undefined ? prepareCanvas(next) : next;
    });
  }
  function handleDrop(parentId: string | null, beforeId: string | null) {
    if (!dragPayload) return;
    if (dragPayload.kind === "new") {
      const taken = collectIds(doc.elements);
      const element = createMockupElement(dragPayload.elementType, taken);
      if (parentId === null) element.layout = defaultLayout(element, doc.elements.length, doc.canvas!.width);
      setDoc(current => prepareCanvas({ ...current, elements: insertElement(current.elements, parentId, resolveIndex(current.elements, parentId, beforeId), element) }));
      setSelectedId(element.id);
    } else {
      const draggedId = dragPayload.id;
      if (draggedId === parentId || draggedId === beforeId) { setDragPayload(null); return; }
      const draggedElement = findElement(doc.elements, draggedId);
      if (!draggedElement || (parentId && isSelfOrDescendant(draggedElement, parentId))) { setDragPayload(null); return; }
      setDoc(current => {
        const { elements: without, removed } = removeElement(current.elements, draggedId);
        if (!removed) return current;
        return prepareCanvas({ ...current, elements: insertElement(without, parentId, resolveIndex(without, parentId, beforeId), { ...removed, layout: undefined }) });
      });
    }
    setDragPayload(null);
  }
  function dropOnCanvas(x: number, y: number) {
    if (!dragPayload) return;
    const element = dragPayload.kind === "new" ? createMockupElement(dragPayload.elementType, collectIds(doc.elements)) : findElement(doc.elements, dragPayload.id);
    if (!element) return;
    const layout = { ...defaultLayout(element, 0, doc.canvas!.width) };
    layout.x = Math.max(0, Math.min(x, doc.canvas!.width - layout.width));
    layout.y = Math.max(0, Math.min(y, doc.canvas!.height - layout.height));
    setDoc(current => ({ ...current, elements: [...removeElement(current.elements, element.id).elements, { ...element, layout }] }));
    setSelectedId(element.id); setDragPayload(null);
  }
  async function save() {
    setError("");
    try { const document = mockupDocumentSchema.parse(doc); await mutate?.({ type: "save_mockup", storyId, name, document }); }
    catch { setError("Mockup ei vasta lubatud kujule: kontrolli, et elementide ID-d oleksid unikaalsed ja struktuur ei ületaks mahupiiranguid."); }
  }
  function loadVersion(item: Version) {
    setDoc(prepareCanvas(parseMockup(item.structureJson) ?? mockupFixtures.booking)); setName(item.name); setSelectedId(null);
  }
  return <>
    {versions.length > 0 && <>
      <label>Versiooniajalugu<select aria-label="Versiooniajalugu" value={version?.id} onChange={event => setSelected(event.target.value)}>{versions.map(item => <option key={item.id} value={item.id}>v{item.version} · {item.name}{item.id === versions[0].id ? " · praegune" : ""}</option>)}</select></label>
      <p className="muted">{version?.source} · {version && new Date(version.createdAt).toLocaleString("et-EE")}</p>
      <MockupRenderer document={parseMockup(version?.structureJson)} />
      <div className="actions">
        <button disabled={busy || version?.id === versions[0].id} onClick={() => mutate?.({ type: "restore_mockup", storyId, mockupVersionId: version?.id })}>Taasta uue versioonina</button>
        <button disabled={busy} onClick={() => version && loadVersion(version)}>Muuda seda versiooni koostajas</button>
      </div>
    </>}
    <div className={`mockup-builder${expanded ? " expanded" : ""}`} onKeyDown={event => {
      if (busy || preview || !selectedElement || event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || !["Backspace", "Delete"].includes(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable]"))) return;
      event.preventDefault(); event.stopPropagation();
      deleteElement(selectedElement.id);
    }}>
      <div className="actions"><h4>{draftMode ? "AI loodud wireframe" : "Mockupi koostaja"}</h4><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Sulge suur töövaade" : "Ava suur töövaade"}</button></div>
      <p className="muted">Klõpsa elemendil, et muuta selle sisu. Lohista elementi soovitud kohta ja muuda suurust alumisest paremast nurgast. Uue elemendi saad lisada paletilt.</p>
      {!draftMode && <><div className="actions"><button type="button" disabled={busy} onClick={() => { setDoc(prepareCanvas({ schemaVersion: 1, screenName: "Uus wireframe", elements: [] })); setName("Uus wireframe"); setSelectedId(null); }}>Tühi tööpind</button>{Object.entries(mockupFixtures).map(([key, fixture]) => <button key={key} type="button" disabled={busy} onClick={() => { setDoc(prepareCanvas(fixture)); setName(fixture.screenName); setSelectedId(null); }}>Alusta: {fixture.screenName}</button>)}</div>
      <label>Mockupi nimi<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label></>}
      <label>Ekraani nimi<input required maxLength={200} value={doc.screenName} onChange={event => patchDoc({ screenName: event.target.value })} /></label>
      <div className="actions">
        <button type="button" aria-label="Võta joonise muudatus tagasi" disabled={busy || !history.past.length} onClick={() => { setHistory(current => ({ past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] })); setSelectedId(null); }}>Võta tagasi</button>
        <button type="button" aria-label="Tee joonise muudatus uuesti" disabled={busy || !history.future.length} onClick={() => { setHistory(current => ({ past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) })); setSelectedId(null); }}>Tee uuesti</button>
        <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Muuda wireframe’i" : "Eelvaade"}</button>
        <label>Ekraani laius<select aria-label="Ekraani laius" value={doc.canvas!.width} onChange={event => { const width = Number(event.target.value); setDoc(current => ({ ...current, canvas: { ...current.canvas!, width }, elements: current.elements.map(element => element.layout ? { ...element, layout: { ...element.layout, width: Math.min(element.layout.width, width), x: Math.max(0, Math.min(element.layout.x, width - Math.min(element.layout.width, width))) } } : element) })); }}><option value={375}>Mobiil · 375 px</option><option value={768}>Tahvel · 768 px</option><option value={1200}>Töölaud · 1200 px</option>{![375, 768, 1200].includes(doc.canvas!.width) && <option value={doc.canvas!.width}>{doc.canvas!.width} px</option>}</select></label>
      </div>
      <div className="mockup-palette" role="group" aria-label="Lisa element">{elementTypes.map(type => <button key={type} type="button" draggable disabled={busy}
        onDragStart={event => { event.dataTransfer.setData("text/plain", type); event.dataTransfer.effectAllowed = "copy"; setDragPayload({ kind: "new", elementType: type }); }} onDragEnd={() => setDragPayload(null)}
        onClick={() => addElement(type)}>+ {elementTypeLabels[type]}</button>)}</div>
      <div className="wireframe-workspace">
        {preview ? <MockupRenderer document={doc} /> : <WireframeCanvas document={doc} selectedId={selectedId} busy={busy} dragging={!!dragPayload} onSelect={setSelectedId} onChange={(id, layout) => patchElement(id, { layout })} onDrop={dropOnCanvas} />}
        {!preview && <aside>{selectedElement ? <PropertyPanel element={selectedElement} onChange={patch => patchElement(selectedElement.id, patch)} onDelete={() => deleteElement(selectedElement.id)} /> : <p className="wireframe-property-hint">Vali joonisel element, et muuta selle teksti, suurust või muid omadusi.</p>}</aside>}
      </div>
      <details className="wireframe-layers"><summary>Elemendid ja kihid</summary><div className="mockup-outline" aria-label="Mockupi struktuur">
        {doc.elements.length === 0 && <p className="muted">Veel pole elemente. Lohista või klõpsa paleti nupul, et alustada.</p>}
        <OutlineList elements={doc.elements} parentId={null} selectedId={selectedId} draggingId={dragPayload?.kind === "move" ? dragPayload.id : null} onSelect={setSelectedId} onDrop={handleDrop} onDragStart={id => setDragPayload({ kind: "move", id })} onDragEnd={() => setDragPayload(null)} onDelete={deleteElement} />
      </div></details>
      {error && <p role="alert">{error}</p>}
      {!draftMode && <button type="button" disabled={busy} className="primary-button" onClick={() => void save()}>Salvesta uus mockup-versioon</button>}
    </div>
  </>;
}
