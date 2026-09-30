import { mockupDocumentSchema, type MockupElement } from "@/domain/mockup/document";

function Element({ element }: { element: MockupElement }) {
  const content = <>{element.label && <strong>{element.label}</strong>}{element.text && <p>{element.text}</p>}{element.children?.map(child => <Element key={child.id} element={child} />)}{element.actions?.map((action, index) => <button type="button" disabled key={index}>{action.label}</button>)}</>;
  const attributes = { "data-mockup-element-id": element.id, className: `mockup-element mockup-${element.type}` };
  let body;
  switch (element.type) {
    case "heading": body = <h4>{element.text ?? element.label}</h4>; break;
    case "button": body = <button type="button" disabled>{element.label ?? element.text ?? "Nupp"}</button>; break;
    case "field": body = <label>{element.label ?? "Väli"}<input disabled placeholder={element.props?.placeholder} aria-required={element.props?.required} /></label>; break;
    case "image_placeholder": body = <div className="mockup-image" role="img" aria-label={element.label ?? "Pildi koht"}>{element.label ?? "Pildi koht"}</div>; break;
    case "list": body = <ul>{element.children?.map(child => <li key={child.id}><Element element={child} /></li>)}</ul>; break;
    default: body = content;
  }
  return <div {...attributes}>{body}<small className="mockup-id">{element.id}</small></div>;
}
export function MockupRenderer({ document }: { document: unknown }) {
  const parsed = mockupDocumentSchema.safeParse(document);
  if (!parsed.success) return <p role="alert">Mockupi struktuur on vigane ja seda ei kuvata.</p>;
  return <div className="mockup-preview" aria-label="Mockupi eelvaade"><h4>{parsed.data.screenName}</h4>{parsed.data.description && <p>{parsed.data.description}</p>}{parsed.data.elements.length ? parsed.data.elements.map(element => <Element key={element.id} element={element} />) : <p>Mockup puudub.</p>}</div>;
}
