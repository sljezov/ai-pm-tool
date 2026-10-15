"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationData } from "@/domain/ai/contracts";
import type { BacklogData } from "@/components/backlog/backlog";
import { categoryLabels, Finding, findingIsStale } from "@/components/proposals/grooming";
import { ManualGrooming } from "@/components/backlog/grooming";

export function GroomingWorkspace({ projectId, initial, backlog }: { projectId: string; initial: ConversationData; backlog: BacklogData }) {
  const [history, setHistory] = useState(initial);
  const [data, setData] = useState(backlog);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const router = useRouter();
  useEffect(() => {
    async function sync(event: Event) {
      if (event instanceof CustomEvent && event.detail !== projectId) return;
      try {
        const [conversation, backlog] = await Promise.all([fetch(`/api/projects/${projectId}/conversation`), fetch(`/api/projects/${projectId}/backlog`)]);
        if (!conversation.ok || !backlog.ok) throw new Error("Groomimise värskendamine ebaõnnestus.");
        setHistory(await conversation.json()); setData(await backlog.json());
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Värskendamine ebaõnnestus."); }
    }
    window.addEventListener("backlog-updated", sync);
    return () => window.removeEventListener("backlog-updated", sync);
  }, [projectId]);
  const review = [...history.messages].reverse().find(message => message.response && "findings" in message.response.payload);
  const findings = review?.response && "findings" in review.response.payload ? review.response.payload.findings : [];
  const proposalFor = (id: string) => review?.findingProposals.find(item => item.temporaryId === id);
  const active = findings.filter(finding => proposalFor(finding.temporaryId)?.status === "pending" && !findingIsStale(finding, data.stories));
  const current = findings.find(finding => finding.temporaryId === selected) ?? active[0] ?? findings[0];
  async function request(endpoint: "conversation" | "backlog", method: "POST" | "PATCH", command: unknown) {
    if (submitting.current) return false;
    submitting.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/${endpoint}`, { method, headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(command) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Toiming ebaõnnestus.");
      const other = await fetch(`/api/projects/${projectId}/${endpoint === "conversation" ? "backlog" : "conversation"}`);
      if (!other.ok) throw new Error("Andmete värskendamine ebaõnnestus. Laadi leht uuesti.");
      const nextHistory: ConversationData = endpoint === "conversation" ? result : await other.json();
      const nextBacklog: BacklogData = endpoint === "backlog" ? result : await other.json();
      setHistory(nextHistory); setData(nextBacklog);
      if (method === "PATCH") {
        const nextReview = [...nextHistory.messages].reverse().find(message => message.response && "findings" in message.response.payload);
        const nextFindings = nextReview?.response && "findings" in nextReview.response.payload ? nextReview.response.payload.findings : [];
        setSelected(nextFindings.find(finding => nextReview?.findingProposals.some(item => item.temporaryId === finding.temporaryId && item.status === "pending") && !findingIsStale(finding, nextBacklog.stories))?.temporaryId ?? null);
        setNotice("Leid lahendatud. Jätka järgmise aktiivse leiuga.");
      } else { setSelected(null); setNotice(endpoint === "backlog" ? "Backlog uuendatud." : "Ülevaatus valmis. Vali leid ja vaata muudatus enne rakendamist üle."); }
      window.dispatchEvent(new CustomEvent("backlog-updated", { detail: projectId })); router.refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Toiming ebaõnnestus."); return false; }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="grooming-workspace" aria-label="Groomimise töövaade">
    <div className="grooming-toolbar"><div><h2>Groomimine</h2><p>Kontrolli lugude suurust, kattuvusi, kriteeriume ja mockup’e. Muudatused rakenduvad sinu kinnitusel.</p></div><div className="actions"><button className="primary-button" disabled={busy || !data.stories.length || history.mode === "unavailable"} onClick={() => void request("conversation", "POST", { kind: "text", task: "review_backlog", text: "Vaata backlogi kvaliteet üle." })}>{busy ? "Töötlen…" : "Kontrolli backlogi"}</button><button disabled={busy || !data.canUndo} onClick={() => void request("backlog", "POST", { type: "undo" })}>Võta tagasi</button></div></div>
    {history.mode === "fixture" && <p className="muted">Näidis-AI · reeglipõhine ülevaatus</p>}
    {history.mode === "unavailable" && <p>AI pole seadistatud. Lugusid saad allpool käsitsi jagada ja ühendada.</p>}
    {!data.stories.length && <p>Lisa esmalt Backlogi vaates kasutajalood.</p>}
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {review && <><div className="grooming-summary" aria-label="Ülevaatuse kokkuvõte">{Object.entries(categoryLabels).map(([category, label]) => <span key={category}><strong>{findings.filter(finding => finding.category === category).length}</strong> {label}</span>)}</div><p>{active.length} aktiivset leidu · {findings.length} leidu kokku</p></>}
    {!review ? <p>Alustamiseks vajuta „Kontrolli backlogi“. Iga probleemi juures näed põhjendust ja paranduse eelvaadet.</p> : !findings.length ? <p>Ülevaatus ei leidnud parandamist vajavaid probleeme.</p> : <div className="grooming-layout"><nav className="grooming-findings" aria-label="Groomimise leiud">{findings.map(finding => { const status = proposalFor(finding.temporaryId)?.status; const stale = status === "pending" && findingIsStale(finding, data.stories); return <button type="button" aria-current={current?.temporaryId === finding.temporaryId ? "true" : undefined} key={finding.temporaryId} disabled={busy} onClick={() => setSelected(finding.temporaryId)}><strong>{categoryLabels[finding.category]}</strong><span>{proposalFor(finding.temporaryId)?.beforeStories.filter(story => finding.operation.sources.some(source => source.storyId === story.id)).map(story => story.action).join(" + ")}</span><small>{stale ? "Vajab uut kontrolli" : status === "applied" ? "Rakendatud" : status === "rejected" ? "Eiratud" : status === "pending" ? "Ootab ülevaatust" : "Aegunud"}</small></button>; })}</nav><div className="grooming-detail">{current && <Finding key={`${review.id}-${current.temporaryId}`} finding={current} proposal={proposalFor(current.temporaryId)} stories={data.stories} busy={busy} apply={async command => { await request("conversation", "PATCH", command); }} />}</div></div>}
    {!!data.stories.length && <ManualGrooming stories={data.stories} selectedStoryId={data.selectedStoryId} busy={busy} mutate={command => request("backlog", "POST", command)} />}
  </section>;
}
