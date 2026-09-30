"use client";
import { useRef, useState } from "react";
import type { ConversationData, ConversationInput, GuidedTask } from "@/domain/ai/contracts";
type Question = { id: string; text: string; selectionMode: "single" | "multiple"; options: { id: string; label: string }[] };
function QuestionCard({ question, busy, answered, send }: { question: Question; busy: boolean; answered: boolean; send: (answer: { optionIds: string[]; other?: string; skip: boolean }) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState(false);
  const [value, setValue] = useState("");
  return <fieldset className="clarification-card" disabled={busy || answered}>
    <legend>{question.text}</legend>
    {answered && <p className="muted">Vastus salvestatud</p>}
    <div className="actions">{question.options.map(option => <button key={option.id} type="button" aria-pressed={selected.includes(option.id)} onClick={() => {
      if (question.selectionMode === "single") send({ optionIds: [option.id], skip: false });
      else setSelected(values => values.includes(option.id) ? values.filter(id => id !== option.id) : [...values, option.id]);
    }}>{option.label}</button>)}<button type="button" aria-expanded={other} onClick={() => setOther(!other)}>Muu (kirjutan ise)</button><button type="button" onClick={() => send({ optionIds: [], skip: true })}>Jäta vahele</button></div>
    {other && <label>Muu vastus<textarea value={value} maxLength={1000} onChange={e => setValue(e.target.value)} /></label>}
    {(other || question.selectionMode === "multiple") && <button type="button" className="primary-button" disabled={!selected.length && !value.trim()} onClick={() => send({ optionIds: selected, ...(value.trim() ? { other: value.trim() } : {}), skip: false })}>Saada vastus</button>}
  </fieldset>;
}
export function Conversation({ projectId, initial }: { projectId: string; initial: ConversationData }) {
  const [data, setData] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latest = [...data.messages].reverse().find(message => message.response);
  const answeredIds = data.messages.flatMap(message => message.answeredQuestionIds);
  async function send(input: ConversationInput) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/conversation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      if (input.kind === "text") setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Päring ebaõnnestus. Proovi uuesti.");
      // Recover persisted failed or completed turns after a lost HTTP response.
      try { const response = await fetch(`/api/projects/${projectId}/conversation`); if (response.ok) setData(await response.json()); } catch { /* Keep the draft and manual controls. */ }
    } finally { submitting.current = false; setBusy(false); }
  }
  function action(task: string) {
    if (task === "write_text") { inputRef.current?.focus(); return; }
    void send({ kind: "text", task: task as GuidedTask, text: text.trim() || (task === "propose_roles" ? "Paku kasutajarolle viimaste täpsustuste põhjal." : "Täpsustame projekti ideed.") });
  }
  return <section className="conversation" aria-label="Projekti vestlus">
    <div className="conversation-heading"><h3>Vestlus</h3><span className="stage-badge">{data.mode === "fixture" ? "Näidis-AI · fixture" : data.mode === "live" ? "AI ühendatud" : "AI pole seadistatud"}</span></div>
    {data.mode === "unavailable" && <p className="muted">Saad sõnumeid salvestada ja backlogi käsitsi hallata. AI ühenduse puudumisel saad vastust hiljem uuesti proovida.</p>}
    {!data.messages.length && <p className="muted">Kirjelda ühe lausega oma ideed. Aitan küsimuste ja valikutega seda täpsustada.</p>}
    <div className="conversation-history" aria-label="Vestluse ajalugu">{data.messages.map(message => <article key={message.id} className={`conversation-message message-${message.role}`}>
      <span className="eyebrow">{message.role === "user" ? "SINA" : message.role === "assistant" ? "AI ETTEPANEK" : "TEADE"}</span><p>{message.content}</p>
      {message.response && "questions" in message.response.payload && message.response.payload.questions.map(question => <QuestionCard key={question.id} question={question} busy={busy} answered={answeredIds.includes(question.id) || latest?.id !== message.id} send={answer => void send({ kind: "answer", messageId: message.id, questionId: question.id, ...answer })} />)}
      {message.response && "roles" in message.response.payload && <div className="role-proposal"><h4>Rollide ettepanek</h4><p className="muted">Vaata soovitatud rollid üle või täpsusta neid vestluses. Rollid pole veel projekti lisatud.</p>{message.response.payload.roles.map(role => <div className="child-card" key={role.temporaryId}><strong>{role.name}</strong><p>{role.rationale}</p></div>)}</div>}
      {message.response && latest?.id === message.id && <div className="actions" aria-label="Järgmised tegevused">{message.response.nextActions.map(next => <button key={next.id} type="button" disabled={busy} onClick={() => action(next.action)}>{next.label}</button>)}</div>}
      {message.role === "user" && message.requestStatus === "failed" && <button className="text-button" disabled={busy} onClick={() => void send({ kind: "retry", messageId: message.id })}>Proovi vastust uuesti</button>}
    </article>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {busy && <p role="status">AI koostab vastust…</p>}
    <form onSubmit={event => { event.preventDefault(); if (text.trim()) void send({ kind: "text", text }); }}>
      <label htmlFor="conversation-text">Sinu idee või täpsustus</label><textarea ref={inputRef} id="conversation-text" value={text} maxLength={4000} rows={3} disabled={busy} onChange={event => setText(event.target.value)} placeholder="Soovin spordiklubile rakendust…" />
      <button className="primary-button" disabled={busy || !text.trim()}>{busy ? "Saadan…" : "Saada sõnum"}</button>
    </form>
  </section>;
}
