"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateProject() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), description: data.get("description") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push(`/projects/${result.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Projekti loomine ebaõnnestus."); setBusy(false); }
  }
  return <form onSubmit={submit} className="project-form">
    <label htmlFor="project-name">Projekti nimi</label><input id="project-name" name="name" placeholder="Näiteks spordiklubi broneeringud" required maxLength={120} disabled={busy} />
    <label htmlFor="project-description">Lühikirjeldus <span className="optional">valikuline</span></label><textarea id="project-description" name="description" placeholder="Millist probleemi soovid lahendada?" rows={5} maxLength={4000} disabled={busy} />
    {error && <p className="error" role="alert">{error}</p>}<button className="primary-button" disabled={busy} type="submit">{busy ? "Loon projekti…" : "Loo projekt"}<span aria-hidden="true">→</span></button>
    <p className="form-note">Projekt salvestatakse sinu kohalikku andmebaasi.</p>
  </form>;
}
