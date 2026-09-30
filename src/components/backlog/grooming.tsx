"use client";
import { useState } from "react";
import type { BacklogData } from "./backlog";
import { replacementSchema, type Replacement } from "@/domain/grooming/contracts";
import { GroomingPreview, ReplacementEditor } from "@/components/proposals/grooming";
export function ManualGrooming({ stories, selectedStoryId, busy, mutate }: { stories: BacklogData["stories"]; selectedStoryId: string | null; busy: boolean; mutate: (command: Record<string, unknown>) => Promise<boolean> }) {
  const [operation, setOperation] = useState<Replacement | null>(null); const [selected, setSelected] = useState<string[]>([]); const story = stories.find(item => item.id === selectedStoryId);
  function preview(type: "split_story" | "merge_stories") {
    const sources = type === "split_story" ? story ? [story] : [] : stories.filter(item => selected.includes(item.id));
    if (!sources.length) return;
    const first = sources[0]; const wording = { role: first.role, action: first.action, benefit: first.benefit };
    const criteria = sources.flatMap(item => item.criteria).map(item => item.id); const midpoint = Math.ceil(criteria.length / 2);
    setOperation({ type, sources: sources.map(item => ({ storyId: item.id, version: item.version })), results: type === "split_story" ? [{ ...wording, criterionIds: criteria.slice(0, midpoint) }, { ...wording, action: `kontrollida tulemust: ${first.action}`.slice(0, 1000), criterionIds: criteria.slice(midpoint) }] : [{ ...wording, criterionIds: criteria }] });
  }
  return <section className="manual-grooming"><h3>Lugude jagamine ja ühendamine</h3><button disabled={busy || !story} onClick={() => preview("split_story")}>Jaga valitud lugu</button><fieldset disabled={busy}><legend>Vali ühendatavad lood</legend>{stories.map(item => <label className="checkbox-label" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected(values => values.includes(item.id) ? values.filter(id => id !== item.id) : [...values, item.id])} />{item.role} · {item.action}</label>)}<button disabled={selected.length < 2 || selected.length > 8} onClick={() => preview("merge_stories")}>Ühenda valitud lood</button></fieldset>{operation && <div className="manual-grooming-preview"><h4>{operation.type === "split_story" ? "Jagamise eelvaade" : "Ühendamise eelvaade"}</h4><ReplacementEditor operation={operation} stories={stories} onChange={setOperation} disabled={busy} /><GroomingPreview operation={operation} stories={stories} /><div className="actions"><button className="primary-button" disabled={busy || !replacementSchema.safeParse(operation).success} onClick={async () => { if (await mutate(operation)) { setOperation(null); setSelected([]); } }}>Kinnita {operation.type === "split_story" ? "jagamine" : "ühendamine"}</button><button disabled={busy} onClick={() => setOperation(null)}>Loobu</button></div></div>}</section>;
}
