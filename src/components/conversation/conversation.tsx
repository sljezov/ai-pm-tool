"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationData, ConversationInput, ConversationTask } from "@/domain/ai/contracts";
import { GroomingReview } from "@/components/proposals/grooming";
import { RefinementProposal } from "@/components/proposals/refinement";
import { PrototypeProposal } from "@/components/proposals/prototype";

type Question = { id: string; text: string; selectionMode: "single" | "multiple"; options: { id: string; label: string }[] };
type LocalAnswer = { selected: string[]; other: string; showOther: boolean; skip: boolean };
const emptyAnswer = (): LocalAnswer => ({ selected: [], other: "", showOther: false, skip: false });
const answerReady = (answer: LocalAnswer | undefined) => !!answer && (answer.skip || answer.selected.length > 0 || !!answer.other.trim());

/** One assistant turn can carry several questions; only one confirmed send exists for the whole batch so a click never silently finalizes a sibling. */
function QuestionGroup({ questions, busy, answeredIds, expired, send }: { questions: Question[]; busy: boolean; answeredIds: string[]; expired: boolean; send: (questionId: string, answer: { optionIds: string[]; other?: string; skip: boolean }) => Promise<boolean> }) {
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [submitting, setSubmitting] = useState(false);
  const update = (id: string, patch: Partial<LocalAnswer>) => setAnswers(values => ({ ...values, [id]: { ...emptyAnswer(), ...values[id], ...patch } }));
  const pending = expired ? [] : questions.filter(question => !answeredIds.includes(question.id));
  const ready = pending.length > 0 && pending.every(question => answerReady(answers[question.id]));
  const doneCount = pending.filter(question => answerReady(answers[question.id])).length;
  async function submitAll() {
    setSubmitting(true);
    try {
      for (const question of pending) {
        const answer = answers[question.id]!;
        const ok = await send(question.id, { optionIds: answer.skip ? [] : answer.selected, ...(answer.other.trim() ? { other: answer.other.trim() } : {}), skip: answer.skip });
        if (!ok) break;
      }
    } finally { setSubmitting(false); }
  }
  return <div className="question-group">
    {questions.map(question => {
      const answered = answeredIds.includes(question.id);
      const isExpired = expired && !answered;
      const locked = answered || isExpired;
      const answer = answers[question.id] ?? emptyAnswer();
      return <fieldset className="clarification-card" key={question.id} disabled={busy || submitting || locked}><legend>{question.text}</legend>
        {answered && <p className="muted">Vastus salvestatud</p>}
        {isExpired && <p className="muted">See küsimus aegus, sest vestlus liikus vahepeal edasi. Sinu vastus siia ei salvestunud.</p>}
        {!locked && <div className="actions">
          {question.options.map(option => <button key={option.id} type="button" aria-pressed={answer.selected.includes(option.id)} onClick={() => update(question.id, question.selectionMode === "single" ? { selected: [option.id], skip: false } : { selected: answer.selected.includes(option.id) ? answer.selected.filter(id => id !== option.id) : [...answer.selected, option.id], skip: false })}>{option.label}</button>)}
          <button type="button" aria-expanded={answer.showOther} onClick={() => update(question.id, { showOther: !answer.showOther, skip: false })}>Muu (kirjutan ise)</button>
          <button type="button" aria-pressed={answer.skip} onClick={() => update(question.id, { skip: !answer.skip, selected: [], showOther: false, other: "" })}>Jäta vahele</button>
        </div>}
        {!locked && answer.showOther && <label>Muu vastus<textarea value={answer.other} maxLength={1000} onChange={event => update(question.id, { other: event.target.value })} /></label>}
      </fieldset>;
    })}
    {pending.length > 0 && <p className="muted">{pending.length > 1 ? "Vali vastus igale küsimusele. Miski ei saadeta enne, kui vajutad allolevat nuppu." : "Vali vastus ja vajuta seejärel allolevat nuppu."}</p>}
    {pending.length > 0 && <button type="button" className="primary-button" disabled={busy || submitting || !ready} onClick={() => void submitAll()}>{submitting ? "Saadan…" : pending.length > 1 ? `Saada kõik vastused (${doneCount}/${pending.length})` : "Saada vastus"}</button>}
  </div>;
}

type ProposalState = { busy: boolean; apply: (command: unknown) => Promise<void>; generate: (task: ConversationTask, text: string) => void };
function RoleProposal({ roles, proposalId, status, state }: { roles: Array<{ temporaryId: string; name: string; rationale: string }>; proposalId: string | null; status: string | null; state: ProposalState }) {
  const [included, setIncluded] = useState(() => roles.map(role => role.temporaryId));
  const [names, setNames] = useState(() => Object.fromEntries(roles.map(role => [role.temporaryId, role.name])));
  const [primary, setPrimary] = useState(roles[0]?.temporaryId ?? ""); const pending = status === "pending" && !!proposalId;
  return <div className="role-proposal"><h4>Rollide ettepanek</h4><p className="muted">Muuda nimesid, vali sobivad rollid ja märgi üks peamiseks.</p>{roles.map(role => <div className="child-card proposal-row" key={role.temporaryId}><strong>{role.name}</strong><label className="proposal-check"><input type="checkbox" checked={included.includes(role.temporaryId)} disabled={!pending || state.busy} onChange={() => setIncluded(values => values.includes(role.temporaryId) ? values.filter(id => id !== role.temporaryId) : [...values, role.temporaryId])} />Kasuta rolli</label><input aria-label={`${role.name} nimi`} value={names[role.temporaryId]} maxLength={300} disabled={!pending || state.busy} onChange={event => setNames(value => ({ ...value, [role.temporaryId]: event.target.value }))} /><label className="proposal-check"><input type="radio" name={`primary-${proposalId}`} checked={primary === role.temporaryId} disabled={!pending || state.busy || !included.includes(role.temporaryId)} onChange={() => setPrimary(role.temporaryId)} />Peamine roll</label><p>{role.rationale}</p></div>)}{pending ? <button className="primary-button" type="button" disabled={state.busy || !included.length || !included.includes(primary) || included.some(id => !names[id]?.trim())} onClick={() => void state.apply({ kind: "confirm_roles", proposalId, roles: included.map(temporaryId => ({ temporaryId, name: names[temporaryId].trim() })), primaryTemporaryId: primary })}>Kinnita rollid</button> : status === "applied" ? <div className="actions"><span className="success-note">Rollid kinnitatud</span><button className="primary-button" type="button" onClick={() => state.generate("propose_stories", "Koosta peamise rolli happy-path kasutajalood.")}>Genereeri happy-path lood</button></div> : <p className="muted">See ettepanek pole enam aktiivne.</p>}</div>;
}

function StoryProposal({ payload, proposalId, status, state }: { payload: { primaryRole: string; stories: Array<{ temporaryId: string; role: string; action: string; benefit: string; rationale?: string; happyPathOrder: number; selectedByDefault: boolean }> }; proposalId: string | null; status: string | null; state: ProposalState }) {
  const ordered = [...payload.stories].sort((a, b) => a.happyPathOrder - b.happyPathOrder);
  const [selected, setSelected] = useState(() => ordered.filter(story => story.selectedByDefault).map(story => story.temporaryId)); const pending = status === "pending" && !!proposalId;
  const apply = (ids: string[]) => state.apply({ kind: "confirm_stories", proposalId, selectedTemporaryIds: ids });
  return <div className="story-proposal"><h4>{payload.primaryRole} · happy path</h4><p className="muted">Vali backlogi lisatavad lood. Enne kinnitamist midagi ei muudeta.</p>{ordered.map(story => <label className="child-card selectable-story" key={story.temporaryId}><input type="checkbox" checked={selected.includes(story.temporaryId)} disabled={!pending || state.busy} onChange={() => setSelected(values => values.includes(story.temporaryId) ? values.filter(id => id !== story.temporaryId) : [...values, story.temporaryId])} /><span><strong>{story.happyPathOrder}. {story.role}na soovin {story.action}, et {story.benefit}.</strong>{story.rationale && <small>{story.rationale}</small>}</span></label>)}{pending ? <div className="actions"><button type="button" disabled={state.busy} onClick={() => void apply(ordered.map(story => story.temporaryId))}>Lisa kõik</button><button className="primary-button" type="button" disabled={state.busy || !selected.length} onClick={() => void apply(selected)}>Lisa valitud ({selected.length})</button><button type="button" disabled={state.busy} onClick={() => state.generate("propose_stories", "Genereeri happy-path lood uuesti.")}>Genereeri uuesti</button></div> : status === "applied" ? <div className="actions"><span className="success-note">Valitud lood lisatud</span><button className="primary-button" type="button" onClick={() => state.generate("recommend_priority", "Soovita backlogist kõige olulisem lugu.")}>Küsi prioriteedisoovitus</button></div> : <p className="muted">See ettepanek pole enam aktiivne.</p>}</div>;
}

function PriorityProposal({ payload, proposalId, status, stories, state }: { payload: { storyId: string; rationale: string }; proposalId: string | null; status: string | null; stories: ConversationData["stories"]; state: ProposalState }) {
  const [selected, setSelected] = useState(payload.storyId); const pending = status === "pending" && !!proposalId; const recommended = stories.find(story => story.id === payload.storyId);
  return <div className="priority-proposal"><h4>Prioriteedisoovitus</h4><p><strong>{recommended ? `${recommended.role}na soovin ${recommended.action}, et ${recommended.benefit}.` : "Soovitatud lugu"}</strong></p><p>{payload.rationale}</p>{pending ? <><label>Vali esimeseks lugu<select value={selected} disabled={state.busy} onChange={event => setSelected(event.target.value)}>{stories.map(story => <option value={story.id} key={story.id}>{story.role} · {story.action}</option>)}</select></label><div className="actions"><button className="primary-button" type="button" disabled={state.busy || !selected} onClick={() => void state.apply({ kind: "confirm_priority", proposalId, storyId: selected })}>{selected === payload.storyId ? "Nõustu soovitusega" : "Vali teine lugu"}</button></div></> : status === "applied" ? <div className="actions"><p className="success-note">Prioriteet kinnitatud ja lugu valitud.</p><button className="primary-button" type="button" disabled={state.busy} onClick={() => state.generate("propose_prototype", "Koosta valitud loo kriteeriumid ja mockup.")}>Genereeri kriteeriumid ja mockup</button></div> : <p className="muted">See ettepanek pole enam aktiivne.</p>}</div>;
}

export function Conversation({ projectId, initial }: { projectId: string; initial: ConversationData }) {
  const router = useRouter(); const [data, setData] = useState(initial); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const submitting = useRef(false); const [error, setError] = useState(""); const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  useEffect(() => {
    const box = historyRef.current;
    if (!box) return;
    const onScroll = () => { nearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80; };
    box.addEventListener("scroll", onScroll);
    return () => box.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { const box = historyRef.current; if (box && nearBottom.current) box.scrollTop = box.scrollHeight; }, [data, busy]);
  useEffect(() => {
    async function sync(event: Event) {
      if (event instanceof CustomEvent && event.detail !== projectId) return;
      try { const response = await fetch(`/api/projects/${projectId}/conversation`); if (response.ok) setData(await response.json()); } catch { /* Keep the current conversation state. */ }
    }
    window.addEventListener("backlog-updated", sync); return () => window.removeEventListener("backlog-updated", sync);
  }, [projectId]);
  const latest = [...data.messages].reverse().find(message => message.response); const answeredIds = data.messages.flatMap(message => message.answeredQuestionIds);
  async function request(method: "POST" | "PATCH", input: unknown) {
    if (submitting.current) return false; submitting.current = true; setBusy(true); setError("");
    try { const response = await fetch(`/api/projects/${projectId}/conversation`, { method, headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setData(result); if (method === "PATCH") window.dispatchEvent(new CustomEvent("backlog-updated", { detail: projectId })); router.refresh(); if (method === "POST" && (input as ConversationInput).kind === "text") setText(""); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Päring ebaõnnestus. Proovi uuesti."); try { const response = await fetch(`/api/projects/${projectId}/conversation`); if (response.ok) setData(await response.json()); } catch { /* Manual controls remain available. */ } return false; }
    finally { submitting.current = false; setBusy(false); }
  }
  const send = (input: ConversationInput) => request("POST", input);
  function action(task: string) { if (task === "write_text") { inputRef.current?.focus(); return; } void send({ kind: "text", task: task as ConversationTask, text: text.trim() || (task === "propose_roles" ? "Paku kasutajarolle viimaste täpsustuste põhjal." : task === "propose_stories" ? "Koosta peamise rolli happy-path kasutajalood." : task === "recommend_priority" ? "Soovita backlogist kõige olulisem lugu." : task === "propose_prototype" ? "Koosta valitud loo kriteeriumid ja mockup." : "Täpsustame projekti ideed.") }); }
  const proposalState: ProposalState = { busy, apply: async command => { await request("PATCH", command); }, generate: (task, value) => { void send({ kind: "text", task, text: value }); } };
  return <div className="conversation-shell">
    <div className="conversation-heading"><h3>Vestlus</h3><span className="stage-badge">{data.mode === "fixture" ? "Näidis-AI · fixture" : data.mode === "live" ? "AI ühendatud" : "AI pole seadistatud"}</span></div>
    <section className="conversation" aria-label="Projekti vestlus">
    <div className="conversation-scroll" ref={historyRef}>
      {data.mode === "unavailable" && <p className="muted">Saad sõnumeid salvestada ja backlogi käsitsi hallata. AI ühenduse puudumisel saad vastust hiljem uuesti proovida.</p>}{(data.stories.length > 0 || data.selectedStoryId) && <div className="actions">{data.stories.length > 0 && <button type="button" disabled={busy} onClick={() => proposalState.generate("review_backlog", "Vaata backlogi kvaliteet üle.")}>Vaata backlog üle</button>}{data.selectedStoryId && <button type="button" disabled={busy} onClick={() => proposalState.generate("propose_prototype", "Koosta valitud loo kriteeriumid ja mockup.")}>Koosta valitud loo prototüüp</button>}{data.selectedStoryId && <button type="button" disabled={busy || !text.trim()} onClick={() => proposalState.generate("propose_refinement", text.trim())}>Täpsusta valitud lugu</button>}</div>}{!data.messages.length && <p className="muted">Kirjelda ühe lausega oma ideed. Aitan küsimuste ja valikutega seda täpsustada.</p>}<div className="conversation-history" aria-label="Vestluse ajalugu">{data.messages.map(message => <article key={message.id} className={`conversation-message message-${message.role}`}><span className="eyebrow">{message.role === "user" ? "SINA" : message.role === "assistant" ? "AI ETTEPANEK" : "TEADE"}</span><p>{message.content}</p>{message.response && "questions" in message.response.payload && <QuestionGroup questions={message.response.payload.questions} busy={busy} answeredIds={answeredIds} expired={latest?.id !== message.id} send={(questionId, answer) => send({ kind: "answer", messageId: message.id, questionId, ...answer })} />}{message.response && "findings" in message.response.payload && <GroomingReview projectId={projectId} findings={message.response.payload.findings} proposals={message.findingProposals} busy={busy} apply={proposalState.apply} />}{message.response && "roles" in message.response.payload && <RoleProposal roles={message.response.payload.roles} proposalId={message.proposalId} status={message.proposalStatus} state={proposalState} />}{message.response && "stories" in message.response.payload && <StoryProposal payload={message.response.payload} proposalId={message.proposalId} status={message.proposalStatus} state={proposalState} />}{message.response && "storyId" in message.response.payload && <PriorityProposal payload={message.response.payload} proposalId={message.proposalId} status={message.proposalStatus} stories={data.stories} state={proposalState} />}{message.response && "targetStoryId" in message.response.payload && !("crossStorySuggestions" in message.response.payload) && <PrototypeProposal payload={message.response.payload} proposalId={message.proposalId} status={message.proposalStatus} busy={busy} apply={proposalState.apply} />}{message.response && "crossStorySuggestions" in message.response.payload && <RefinementProposal stories={data.stories} payload={message.response.payload} proposalId={message.proposalId} status={message.proposalStatus} busy={busy} apply={proposalState.apply} />}{message.response && latest?.id === message.id && <div className="actions" aria-label="Järgmised tegevused">{message.response.nextActions.map(next => <button key={next.id} type="button" disabled={busy} onClick={() => action(next.action)}>{next.label}</button>)}</div>}{message.role === "user" && message.requestStatus === "failed" && <button className="text-button" disabled={busy} onClick={() => void send({ kind: "retry", messageId: message.id })}>Proovi vastust uuesti</button>}</article>)}</div>{error && <p className="error" role="alert">{error}</p>}{busy && <p role="status">AI koostab või rakendab ettepanekut…</p>}
    </div>
    <form className="conversation-input" onSubmit={event => { event.preventDefault(); if (text.trim()) void send({ kind: "text", text }); }}><label htmlFor="conversation-text">Sinu idee või täpsustus</label><textarea ref={inputRef} id="conversation-text" value={text} maxLength={4000} rows={3} disabled={busy} onChange={event => setText(event.target.value)} placeholder="Soovin spordiklubile rakendust…" /><button className="primary-button" disabled={busy || !text.trim()}>{busy ? "Saadan…" : "Saada sõnum"}</button></form>
    </section>
  </div>;
}
