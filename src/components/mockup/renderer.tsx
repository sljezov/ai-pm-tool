import { elementTypeLabels, mockupDocumentSchema, type MockupElement } from "@/domain/mockup/document";
import { calendarPeriod, fieldInputType, isCalendarElement } from "@/domain/mockup/presentation";
import { prepareCanvas } from "@/domain/mockup/layout";

function TableDrawing({ element }: { element: MockupElement }) {
  const count = element.props?.columns ?? element.props?.headers?.length ?? 3;
  const headers = Array.from({ length: count }, (_, index) => element.props?.headers?.[index] ?? ["Nimetus", "Staatus", "Tegevus"][index] ?? `Veerg ${index + 1}`);
  const rows = element.props?.rows ?? Array.from({ length: 4 }, (_, index) => headers.map((_, column) => column === 0 ? `Näidis ${index + 1}` : column === 1 ? (index % 2 ? "Ootel" : "Kinnitatud") : column === 2 ? "Vaata" : "—"));
  return <div className="wire-table"><div className="wire-component-heading"><strong>{element.label || "Ülevaade"}</strong><span>{rows.length} kirjet</span></div>{element.text && <p>{element.text}</p>}<div className="wire-table-scroll"><table><thead><tr>{headers.map((header, index) => <th key={index}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map((_, column) => <td key={column}>{row[column] ?? "—"}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="wire-empty-state">Kirjeid pole</p>}</div></div>;
}

function CalendarDrawing({ element }: { element: MockupElement }) {
  const { days, offset } = calendarPeriod(element);
  const selected = Math.min(element.props?.selectedDay ?? 15, days);
  const slots = element.props?.slots ?? ["09:00", "10:30", "13:00", "14:30"];
  return <div className="wire-calendar"><strong>{element.label || "Vali kuupäev"}</strong>{element.text && <p>{element.text}</p>}
    <div className="wire-calendar-toolbar"><span aria-hidden="true">‹</span><strong>{element.props?.monthLabel || "Kuu vaade"}</strong><span aria-hidden="true">›</span></div>
    <div className="wire-calendar-grid" aria-label="Kalendri päevad">{["E", "T", "K", "N", "R", "L", "P"].map((day, index) => <span className="wire-weekday" key={`weekday-${index}`}>{day}</span>)}{Array.from({ length: offset }, (_, index) => <span aria-hidden="true" key={`empty-${index}`} />)}{Array.from({ length: days }, (_, index) => <span key={index} className={`wire-calendar-day${index + 1 === selected ? " chosen" : ""}${(index + offset) % 7 >= 5 ? " weekend" : ""}`}>{index + 1}</span>)}</div>
    <div className="wire-calendar-slots"><span>{selected}. kuupäeva vabad ajad</span><div>{slots.map((slot, index) => <span className="wire-time-slot" key={index}>{slot}</span>)}{!slots.length && <span>Vabu aegu ei ole</span>}</div></div>
  </div>;
}

function FieldDrawing({ element }: { element: MockupElement }) {
  const type = fieldInputType(element);
  const label = <>{element.label || "Väli"}{element.props?.required && <span className="wire-required"> *</span>}</>;
  return <label className="wire-field">{label}{type === "select" ? <select disabled aria-required={element.props?.required} defaultValue=""><option value="">{element.props?.placeholder || "Vali…"}</option>{(element.props?.options ?? ["Valik 1", "Valik 2"]).map((option, index) => <option key={index}>{option}</option>)}</select> : type === "textarea" ? <textarea disabled rows={2} placeholder={element.props?.placeholder} /> : <input disabled type={type} placeholder={element.props?.placeholder} aria-required={element.props?.required} />}</label>;
}

export function MockupElementView({ element, showEmptyPlaceholder = true }: { element: MockupElement; showEmptyPlaceholder?: boolean }) {
  const Element = MockupElementView;
  const hasChildren = !!element.children?.length || !showEmptyPlaceholder;
  const content = <>{element.label && <strong>{element.label}</strong>}{element.text && <p>{element.text}</p>}{element.children?.map(child => <Element key={child.id} element={child} />)}{element.actions?.map((action, index) => <button type="button" disabled key={index}>{action.label}</button>)}</>;
  const attributes = { "data-mockup-element-id": element.id, className: `mockup-element mockup-${element.type}` };
  let body;
  switch (element.type) {
    case "heading": body = <h4>{element.text ?? element.label}</h4>; break;
    case "button": body = <button type="button" disabled>{element.label ?? element.text ?? "Nupp"}</button>; break;
    case "field": body = <FieldDrawing element={element} />; break;
    case "image_placeholder": body = <div className="mockup-image" role="img" aria-label={element.label ?? "Pildi koht"}><span className="wire-image-icon" aria-hidden="true">▧</span><span>{element.label ?? "Pildi koht"}</span></div>; break;
    case "calendar": body = <CalendarDrawing element={element} />; break;
    case "table": body = hasChildren ? content : isCalendarElement(element) ? <CalendarDrawing element={element} /> : <TableDrawing element={element} />; break;
    case "list": body = <>{element.label && <strong>{element.label}</strong>}{element.text && <p>{element.text}</p>}{hasChildren ? element.children?.some(child => child.layout) ? element.children.map(child => <Element key={child.id} element={child} />) : <ul>{element.children?.map(child => <li key={child.id}><Element element={child} /></li>)}</ul> : <ul className="wire-list">{(element.props?.items ?? ["Loendi element 1", "Loendi element 2", "Loendi element 3"]).map((item, index) => <li key={index}><span className="wire-list-bullet" aria-hidden="true" /><span>{item}</span><span aria-hidden="true">›</span></li>)}</ul>}</>; break;
    case "navigation": body = <nav className="wire-navigation" aria-label={element.label || "Näidisnavigatsioon"}>{element.label && <strong>{element.label}</strong>}{(element.actions?.length ? element.actions.map(action => action.label) : ["Avaleht", "Ülevaade", "Seaded"]).map((label, index) => <span className={index === 0 ? "active" : ""} key={index}>{label}</span>)}{element.children?.map(child => <Element key={child.id} element={child} />)}</nav>; break;
    case "card": body = <>{content}{!hasChildren && <div className="wire-card-detail" aria-hidden="true"><div className="wire-skeleton wide" /><div className="wire-skeleton" /><div className="wire-card-footer"><span className="wire-skeleton short" /><span>↗</span></div></div>}</>; break;
    case "form": body = <>{content}{!hasChildren && <div className="wire-form-example"><label>Nimi<input disabled placeholder="Sisesta nimi" /></label><label>E-post<input disabled placeholder="nimi@näide.ee" /></label><button type="button" disabled>Salvesta</button></div>}</>; break;
    case "alert": case "confirmation": body = <div className="wire-notice"><span className="wire-notice-icon" aria-hidden="true">{element.type === "confirmation" ? "✓" : "!"}</span><div>{content}</div></div>; break;
    default: body = content;
  }
  const empty = showEmptyPlaceholder && !element.label && !element.text && !element.children?.length && !element.actions?.length;
  return <div {...attributes} style={element.layout ? { position: "absolute", left: element.layout.x, top: element.layout.y, width: element.layout.width, height: element.layout.height, margin: 0 } : undefined}>{body}{empty && <span className="mockup-empty-label">{elementTypeLabels[element.type]}</span>}<small className="mockup-id">{element.id}</small></div>;
}
export function MockupRenderer({ document }: { document: unknown }) {
  const parsed = mockupDocumentSchema.safeParse(document);
  if (!parsed.success) return <p role="alert">Mockupi struktuur on vigane ja seda ei kuvata.</p>;
  const drawing = parsed.data.canvas ? prepareCanvas(parsed.data) : parsed.data;
  const canvas = drawing.canvas;
  return <div className="mockup-preview" aria-label="Mockupi eelvaade"><h4>{drawing.screenName}</h4>{drawing.description && <p>{drawing.description}</p>}<div className={canvas ? "mockup-saved-canvas" : undefined} style={canvas ? { position: "relative", width: canvas.width, minHeight: canvas.height } : undefined}>{drawing.elements.length ? drawing.elements.map(element => <MockupElementView key={element.id} element={element} />) : <p>Mockup puudub.</p>}</div></div>;
}
