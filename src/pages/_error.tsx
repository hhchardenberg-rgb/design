import type { NextPageContext } from "next";
import { TEXTS } from "@/lib/tickets/i18n";

// Foutpagina voor verzoeken die Next.js zelf afwijst voordat een route draait, zoals een kapotte
// %-codering in een link (/t/%E0%A4%A: een ticketlink die onderweg is afgekapt). In plaats van de kale
// "400: Bad Request" een nette melding in de talen van de ticketweergave.
export default function ErrorPage({ statusCode }: { statusCode: number }) {
  if (statusCode !== 400) {
    return (
      <main style={{ maxWidth: 448, margin: "0 auto", padding: "64px 16px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>Er is iets misgegaan</h1>
        <p style={{ fontSize: 14, color: "#57534E" }}>Probeer het later opnieuw.</p>
      </main>
    );
  }
  return (
    <main style={{ maxWidth: 448, margin: "0 auto", padding: "64px 16px", textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#1C1917" }}>
      {(["nl", "de", "en"] as const).map((l, i) => (
        <section key={l} lang={l} style={{ marginTop: i ? 32 : 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{TEXTS[l].invalidLinkTitle}</h1>
          <p style={{ fontSize: 14, color: "#57534E", marginTop: 12 }}>{TEXTS[l].invalidLinkBody}</p>
        </section>
      ))}
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => ({ statusCode: res?.statusCode ?? err?.statusCode ?? 500 });
