"use client";
import { useState, useRef, type FormEvent } from "react";
import { mockupFixtures, mockupDocumentSchema, parseMockup } from "@/domain/mockup/document";
import { MockupRenderer } from "./renderer";
type Version = { id: string; version: number; name: string; structureJson: string; source: string; createdAt: Date };
export function MockupEditor({ storyId, versions, busy, mutate }: { storyId: string; versions: Version[]; busy: boolean; mutate: (command: Record<string, unknown>) => Promise<boolean> }) {
  const editor = useRef<HTMLDetailsElement>(null);
  const [selected, setSelected] = useState(versions[0]?.id ?? "");
  const [draft, setDraft] = useState(versions[0]?.structureJson ?? JSON.stringify(mockupFixtures.booking, null, 2));
  const [name, setName] = useState(versions[0]?.name ?? "Treeningu broneerimine");
  const [error, setError] = useState("");
  const version = versions.find(item => item.id === selected) ?? versions[0];
  const preview = parseMockup(draft);
  async function save(event: FormEvent) {
    event.preventDefault(); setError("");
    try { const document = mockupDocumentSchema.parse(JSON.parse(draft)); await mutate({ type: "save_mockup", storyId, name, document }); }
    catch { setError("Kontrolli JSON-i: lubatud komponendid, unikaalsed ID-d ja kuni 200 elementi kuuel tasemel."); }
  }
  return <>
    {versions.length > 0 && <><label>Versiooniajalugu<select aria-label="Versiooniajalugu" value={version?.id} onChange={event => setSelected(event.target.value)}>{versions.map(item => <option key={item.id} value={item.id}>v{item.version} · {item.name}{item.id === versions[0].id ? " · praegune" : ""}</option>)}</select></label><p className="muted">{version?.source} · {version && new Date(version.createdAt).toLocaleString("et-EE")}</p><MockupRenderer document={parseMockup(version?.structureJson)} /><div className="actions"><button disabled={busy || version?.id === versions[0].id} onClick={() => mutate({ type: "restore_mockup", storyId, mockupVersionId: version?.id })}>Taasta uue versioonina</button><button disabled={busy} onClick={() => { setDraft(version!.structureJson); setName(version!.name); if (editor.current) editor.current.open = true; }}>Muuda seda versiooni</button></div></>}
    <details ref={editor}><summary>Mockupi käsitsi lisamine või muutmine</summary><p>Vali näidis või muuda komponentide struktuuri. Nupud eelvaates on illustratiivsed.</p><div className="actions">{Object.entries(mockupFixtures).map(([key, document]) => <button key={key} disabled={busy} onClick={() => { setDraft(JSON.stringify(document, null, 2)); setName(document.screenName); }}>{document.screenName}</button>)}</div><form className="backlog-form" onSubmit={save}><label>Mockupi nimi<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label><label>Mockupi struktuur<textarea aria-label="Mockupi struktuur" rows={12} maxLength={100000} value={draft} onChange={event => setDraft(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<MockupRenderer document={preview} /><button disabled={busy} className="primary-button">Salvesta uus mockup-versioon</button></form></details>
  </>;
}
