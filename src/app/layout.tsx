import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "AI PM · Ideest arenduseni", description: "Projektijuhi tööruum ideede, kasutajalugude ja arendusvalmis backlog’i jaoks." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="et"><body>
    <header className="app-header"><Link className="brand" href="/"><span className="brand-icon">◈</span> AI PM <span className="brand-caption">projektijuhi tööruum</span></Link><span className="local-badge"><span /> Kohalik tööruum</span></header>
    {children}
  </body></html>;
}
