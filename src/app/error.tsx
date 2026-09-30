"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="projects-page"><div className="error-page" role="alert"><h1>Tööruumi avamine ebaõnnestus.</h1><p>Sinu salvestatud andmeid ei muudeta. Kontrolli, et andmebaasi migratsioonid on käivitatud, ja proovi uuesti.</p><button className="primary-button" onClick={reset}>Proovi uuesti</button></div></main>;
}
