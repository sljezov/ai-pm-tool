"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="projects-page"><h1>Tööruumi avamine ebaõnnestus.</h1><p>Kontrolli, et andmebaasi migratsioonid on käivitatud, ja proovi uuesti.</p><button className="primary-button" onClick={reset}>Proovi uuesti</button></main>;
}
