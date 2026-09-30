import Link from "next/link";
export default function NotFound() {
  return <main className="projects-page"><h1>Projekti ei leitud.</h1><p>Projekt võib olla eemaldatud või link on vigane.</p><Link className="back-link" href="/">← Kõik projektid</Link></main>;
}
