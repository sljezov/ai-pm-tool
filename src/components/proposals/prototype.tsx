"use client";
import { useState } from "react";
import type { PrototypeConfirmation, PrototypePayload } from "@/domain/ai/contracts";
import { checkCriterion, mockupElementIds } from "@/domain/criteria/validation";
import { elementTypeLabels, type MockupElement } from "@/domain/mockup/document";
import { prepareCanvas } from "@/domain/mockup/layout";
import { MockupEditor } from "@/components/mockup/editor";
import { MockupRenderer } from "@/components/mockup/renderer";

function allElements(elements: MockupElement[]): MockupElement[] {
  return elements.flatMap(element => [element, ...allElements(element.children ?? [])]);
}

export function PrototypeProposal({ payload, confirmation, proposalId, status, busy, apply }: { payload: PrototypePayload; confirmation?: PrototypeConfirmation; proposalId: string | null; status: string | null; busy: boolean; apply: (command: unknown) => Promise<void> }) {
  const [mockup, setMockup] = useState(() => prepareCanvas(confirmation?.mockup ?? payload.mockup));
  const [criteria, setCriteria] = useState(() => payload.criteria.map(item => ({ ...(confirmation?.criteria.find(value => value.temporaryId === item.temporaryId) ?? item), accepted: confirmation ? confirmation.criteria.some(value => value.temporaryId === item.temporaryId) : true, editing: false })));
  const [acceptStory, setAcceptStory] = useState(confirmation?.acceptProposedStory ?? false);
  const pending = status === "pending" && !!proposalId;
  const ids = mockupElementIds(JSON.stringify(mockup));
  const elements = allElements(mockup.elements);
  const accepted = criteria.filter(item => item.accepted);
  const invalid = accepted.some(item => checkCriterion(item.text, item.mockupElementIds, ids).status === "fail");
  return <div className="prototype-proposal">
    <h4>Sinu esimene wireframe</h4>
    <p className="muted">AI koostas joonise. Saad selle elemente kohe liigutada, suurust muuta ja tekste parandada. Kinnita, kui tulemus sobib.</p>
    {pending ? <MockupEditor initialDocument={mockup} onDocumentChange={setMockup} busy={busy} /> : <MockupRenderer document={mockup} />}
    <details className="prototype-criteria"><summary>Kriteeriumid ({criteria.length}){invalid ? " · vajavad parandamist" : ""}</summary>
      <p className="muted">AI sidus tingimused joonise elementidega. Vajadusel muuda sõnastust või jäta tingimus välja.</p>
      {payload.proposedStory && <label className="proposal-check"><input type="checkbox" checked={acceptStory} disabled={!pending || busy} onChange={event => setAcceptStory(event.target.checked)} />Rakenda ka sõnastus: {payload.proposedStory.role}na soovin {payload.proposedStory.action}, et {payload.proposedStory.benefit}.</label>}
      {criteria.map((item, index) => {
    const check = checkCriterion(item.text, item.mockupElementIds, ids);
    const update = (patch: Partial<typeof item>) => setCriteria(values => values.map(value => value.temporaryId === item.temporaryId ? { ...value, ...patch } : value));
        return <fieldset className="prototype-criterion" key={item.temporaryId} disabled={!pending || busy}>
          <legend>Kriteerium {index + 1}</legend>
          <div className="prototype-criterion-row"><label className="proposal-check"><input type="checkbox" aria-label={`Kasuta kriteeriumi ${index + 1}`} checked={item.accepted} onChange={event => update({ accepted: event.target.checked })} /><span>{item.text}</span></label><button type="button" aria-expanded={item.editing} onClick={() => update({ editing: !item.editing })}>{item.editing ? "Valmis" : "Muuda"}</button></div>
          {item.editing && <div className="prototype-criterion-edit">
            <label>Kriteeriumi {index + 1} tekst<textarea value={item.text} maxLength={1000} onChange={event => update({ text: event.target.value })} /></label>
            <p className="muted">Seotud elemendid</p>
            <div className="prototype-element-links">{elements.map((element, elementIndex) => <label className="proposal-check" key={element.id}><input type="checkbox" checked={item.mockupElementIds.includes(element.id)} onChange={event => update({ mockupElementIds: event.target.checked ? [...item.mockupElementIds, element.id] : item.mockupElementIds.filter(id => id !== element.id) })} />{element.label || element.text || `${elementTypeLabels[element.type]} ${elementIndex + 1}`}</label>)}</div>
            {item.mockupElementIds.some(id => !ids.includes(id)) && <button type="button" onClick={() => update({ mockupElementIds: item.mockupElementIds.filter(id => ids.includes(id)) })}>Eemalda kustutatud elementide seosed</button>}
          </div>}
          {item.accepted && check.messages.map(message => <p className={check.status === "fail" ? "error" : "muted"} key={message.code}>{message.message}</p>)}
        </fieldset>;
      })}
    </details>
    {pending ? <><p className="muted">Kinnitamisel salvestatakse sinu muudetud joonis ja {accepted.length} valitud kriteeriumi selle kasutajaloo juurde.</p>{invalid && <p role="alert">Mõni valitud kriteerium vajab parandamist. Ava kriteeriumid ja kontrolli sõnastust ning kustutatud elementide seoseid.</p>}<div className="actions"><button type="button" className="primary-button" disabled={busy || !accepted.length || !mockup.elements.length || invalid} onClick={() => void apply({ kind: "confirm_prototype", proposalId, acceptProposedStory: acceptStory, mockup, criteria: accepted.map(({ temporaryId, text, mockupElementIds }) => ({ temporaryId, text, mockupElementIds })) })}>Rakenda kriteeriumid ja mockup</button><button type="button" disabled={busy} onClick={() => void apply({ kind: "reject_prototype", proposalId })}>Loobu</button></div></> : <p className={status === "applied" ? "success-note" : "muted"}>{status === "applied" ? "Kriteeriumid ja mockup kinnitatud" : "See ettepanek pole enam aktiivne."}</p>}
  </div>;
}
