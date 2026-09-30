"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteProject({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) throw new Error((await response.json()).error);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kustutamine ebaõnnestus."); setBusy(false); setConfirming(false); }
  }

  if (!confirming) return <div className="card-manage"><button type="button" className="text-button-danger" onClick={event => { event.preventDefault(); setConfirming(true); }}>Kustuta projekt</button></div>;
  return <div className="card-manage confirm-delete" role="alertdialog" aria-label={`Kustuta projekt ${projectName}`}>
    {error && <p className="error" role="alert">{error}</p>}
    <span className="muted">Kustutada jäädavalt koos kogu backlogi, mockup&apos;ide ja vestlusega?</span>
    <div className="actions">
      <button type="button" className="archive-button" disabled={busy} onClick={event => { event.preventDefault(); void remove(); }}>{busy ? "Kustutan…" : "Jah, kustuta jäädavalt"}</button>
      <button type="button" disabled={busy} onClick={event => { event.preventDefault(); setConfirming(false); }}>Tühista</button>
    </div>
  </div>;
}
