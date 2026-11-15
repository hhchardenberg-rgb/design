"use client";
/* eslint-disable @next/next/no-img-element -- ticketafbeeldingen komen uit de eigen database en moeten exact (ook offline) getoond worden */

import "./ticket-fonts.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { qrMatrix, qrPath } from "@/lib/tickets/design/qr-matrix";
import type { TicketView, ViewBlock, ViewStyle } from "@/lib/tickets/design/view";

// Mobiele ticketweergave. Wordt gebruikt op de openbare ticketpagina (/t/...) én als live
// voorbeeld in de editor, zodat wat de beheerder ziet precies is wat de bezoeker krijgt.
// Alle maten in rem: grotere tekstinstellingen van de telefoon schalen mee.

export interface MobileLabels {
  showQr: string;
  close: string;
  downloadA4: string;
  saveOffline: string;
  savedOffline: string;
  offlineSaveHelp: string;
  offlineValidity: string;
  ticketNumber: string;
  qrDialog: string;
  brightness: string;
  status: string;
  sample: string;
  personalNote: string;
}

export const NL_LABELS: MobileLabels = {
  showQr: "Toon QR-code",
  close: "Sluiten",
  downloadA4: "Download A4-ticket (pdf)",
  saveOffline: "Bewaar op dit toestel",
  savedOffline: "Opgeslagen: dit ticket opent ook zonder internet.",
  offlineSaveHelp: "Handig bij slecht bereik bij het stadion.",
  offlineValidity: "Je ziet een opgeslagen versie. De QR-code werkt; of het ticket nu geldig is, bepaalt de scanner bij de ingang.",
  ticketNumber: "Ticketnummer",
  qrDialog: "QR-code vergroot",
  brightness: "Zet de helderheid van je scherm hoog.",
  status: "Status",
  sample: "Voorbeeld – geeft geen toegang",
  personalNote: "Persoonlijk ticket. Laat de QR-code niet door anderen scannen of kopiëren.",
};

const fontFamily = (f: "din" | "inter") => (f === "din" ? '"TicketDIN", "Arial Narrow", Arial, sans-serif' : '"TicketInter", Inter, Arial, sans-serif');
const headingWeight = (s: ViewStyle) => (s.headingFont === "din" ? (s.headingWeight === "medium" ? 500 : s.headingWeight === "bold" ? 700 : 900) : s.headingWeight === "medium" ? 600 : s.headingWeight === "bold" ? 700 : 800);
const space = (s: ViewStyle) => (s.spacing === "compact" ? 0.75 : s.spacing === "ruim" ? 1.5 : 1.1);

function readableOn(hex: string): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.179 ? "#000000" : "#FFFFFF";
}

export function QrSvg({ code, label, className }: { code: string; label: string; className?: string }) {
  const m = useMemo(() => qrMatrix(code), [code]);
  const q = 4;
  return (
    <svg viewBox={`${-q} ${-q} ${m.size + 2 * q} ${m.size + 2 * q}`} role="img" aria-label={label} className={className} shapeRendering="crispEdges" style={{ display: "block", width: "100%", height: "auto", background: "#FFFFFF" }}>
      <rect x={-q} y={-q} width={m.size + 2 * q} height={m.size + 2 * q} fill="#FFFFFF" />
      <path d={qrPath(m)} fill="#000000" />
    </svg>
  );
}

export function MobileTicket(props: {
  view: TicketView;
  labels?: MobileLabels;
  /** Link naar de A4-pdf (alleen bij een bruikbaar ticket). */
  pdfHref?: string | null;
  /** Op de echte ticketpagina: knop om de pagina offline te bewaren. */
  offline?: boolean;
  /** In de editor: klik op een blok selecteert het onderdeel. */
  onSelectBlock?: (id: ViewBlock["id"]) => void;
  selectedBlock?: string | null;
}) {
  const { view, pdfHref, offline, onSelectBlock, selectedBlock } = props;
  const L = props.labels ?? NL_LABELS;
  const s = view.style;
  const [qrOpen, setQrOpen] = useState(false);
  const gap = `${space(s)}rem`;
  const heading = { fontFamily: fontFamily(s.headingFont), fontWeight: headingWeight(s), lineHeight: 1.08 } as const;
  const body = { fontFamily: fontFamily(s.bodyFont), lineHeight: s.lineHeight } as const;
  const qr = view.blocks.find((b) => b.id === "qr") as Extract<ViewBlock, { id: "qr" }> | undefined;
  const match = view.blocks.find((b) => b.id === "match") as Extract<ViewBlock, { id: "match" }> | undefined;
  const holder = view.blocks.find((b) => b.id === "holder") as Extract<ViewBlock, { id: "holder" }> | undefined;
  const type = view.blocks.find((b) => b.id === "type") as Extract<ViewBlock, { id: "type" }> | undefined;
  const align = s.align === "center" ? "center" : "left";

  const wrapBlock = (id: ViewBlock["id"], node: React.ReactNode, padded = true) => (
    <div
      key={id}
      data-block={id}
      onClick={onSelectBlock ? () => onSelectBlock(id) : undefined}
      style={{
        padding: padded ? `0 1.15rem` : undefined,
        textAlign: align,
        outline: selectedBlock === id ? `2px dashed ${s.accent}` : undefined,
        outlineOffset: 2,
        cursor: onSelectBlock ? "pointer" : undefined,
      }}
    >
      {node}
    </div>
  );

  const blocks = view.blocks.map((b) => {
    switch (b.id) {
      case "header":
        return wrapBlock(
          "header",
          <div style={{ background: s.primary, color: s.onPrimary, display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem 1.15rem", justifyContent: align === "center" ? "center" : "flex-start" }}>
            {b.logo && <img src={b.logo.url} alt="" style={{ height: "2.6rem", width: "auto", objectFit: "contain" }} />}
            {b.clubName && <span style={{ ...heading, fontSize: `${1.25 * s.scale}rem` }}>{b.clubName}</span>}
          </div>,
          false,
        );
      case "hero": {
        const h = b.height === "laag" ? "5.5rem" : b.height === "hoog" ? "12rem" : "8.5rem";
        return wrapBlock(
          "hero",
          <div style={{ height: h, background: s.primary, overflow: "hidden" }} aria-hidden>
            {b.image && <img src={b.image.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${b.focusX}% ${b.focusY}%`, opacity: b.opacity }} />}
          </div>,
          false,
        );
      }
      case "match":
        return wrapBlock(
          "match",
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: align === "center" ? "center" : "flex-start" }}>
            {b.homeLogo && <img src={b.homeLogo.url} alt={b.homeName ?? ""} style={{ width: "2.75rem", height: "2.75rem", objectFit: "contain", flex: "none" }} />}
            <div style={{ minWidth: 0, flex: b.homeLogo ? "1 1 auto" : undefined }}>
              {b.overline && <p style={{ ...body, color: s.accent === s.background ? s.text : s.accent, fontSize: `${0.75 * s.scale}rem`, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{b.overline}</p>}
              <h1 style={{ ...heading, fontSize: `${1.65 * s.scale}rem`, margin: "0.15rem 0 0.35rem", overflowWrap: "anywhere", hyphens: "auto" }}>{b.title}</h1>
              {b.cancelled && <p style={{ ...body, fontWeight: 700, color: "#B91C1C", margin: "0 0 0.25rem" }}>Afgelast</p>}
              {b.lines.map((l, i) => (
                <p key={i} style={{ ...body, margin: 0, color: i < 2 ? s.text : s.muted, fontSize: `${(i < 2 ? 1.05 : 0.95) * s.scale}rem`, fontWeight: i < 2 ? 600 : 400, overflowWrap: "anywhere" }}>{l}</p>
              ))}
            </div>
            {b.awayLogo && <img src={b.awayLogo.url} alt={b.awayName ?? ""} style={{ width: "2.75rem", height: "2.75rem", objectFit: "contain", flex: "none" }} />}
          </div>,
        );
      case "type":
        return wrapBlock(
          "type",
          <div>
            <span style={{ ...body, display: "inline-block", background: s.typeAccent, color: readableOn(s.typeAccent), fontWeight: 700, fontSize: `${0.9 * s.scale}rem`, padding: "0.3rem 0.7rem", borderRadius: Math.min(s.radius, 8), textTransform: "uppercase", letterSpacing: "0.04em", maxWidth: "100%", overflowWrap: "anywhere" }}>{b.label}</span>
            {b.explanation && <p style={{ ...body, color: s.muted, fontSize: `${0.9 * s.scale}rem`, margin: "0.4rem 0 0" }}>{b.explanation}</p>}
          </div>,
        );
      case "qr":
        return wrapBlock(
          "qr",
          <div style={{ textAlign: "center" }}>
            <div style={{ width: `${view.qrSizeMobile}%`, maxWidth: "22rem", margin: "0 auto", background: "#FFFFFF", padding: "0.4rem", borderRadius: Math.min(s.radius, 14), border: `2px solid ${s.border ? s.accent : "#E7E5E4"}` }}>
              <QrSvg code={b.code} label={b.sample ? `QR-code (voorbeeld, geeft geen toegang)` : "QR-code van je ticket"} />
            </div>
            {b.caption && <p style={{ ...body, color: s.muted, fontSize: `${0.85 * s.scale}rem`, margin: "0.5rem 0 0" }}>{b.caption}</p>}
            {b.sample && <p style={{ ...body, color: "#B91C1C", fontWeight: 700, fontSize: "0.8rem", margin: "0.25rem 0 0" }}>{L.sample}</p>}
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); setQrOpen(true); }} style={{ ...body, minHeight: "3rem", borderRadius: 12, border: "none", background: s.primary, color: s.onPrimary, fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}>
                {L.showQr}
              </button>
              {pdfHref && (
                <a href={pdfHref} style={{ ...body, minHeight: "3rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: `2px solid ${s.text}`, color: s.text, fontWeight: 700, textDecoration: "none", fontSize: "1rem" }}>
                  {L.downloadA4}
                </a>
              )}
            </div>
          </div>,
        );
      case "holder":
        return wrapBlock(
          "holder",
          <div>
            {b.label && <p style={{ ...body, color: s.muted, fontSize: `${0.75 * s.scale}rem`, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{b.label}</p>}
            <p style={{ ...heading, fontSize: `${1.35 * s.scale}rem`, margin: "0.1rem 0 0", overflowWrap: "anywhere" }}>{b.name}</p>
            {b.company && <p style={{ ...body, color: s.muted, margin: "0.15rem 0 0", overflowWrap: "anywhere" }}>{b.company}</p>}
          </div>,
        );
      case "access":
        return wrapBlock(
          "access",
          <dl style={{ display: "grid", gridTemplateColumns: `repeat(${b.items.length}, minmax(0, 1fr))`, gap: "0.75rem", margin: 0 }}>
            {b.items.map((it) => (
              <div key={it.label} style={{ minWidth: 0 }}>
                <dt style={{ ...body, color: s.muted, fontSize: `${0.75 * s.scale}rem`, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{it.label}</dt>
                <dd style={{ ...heading, fontSize: `${1.1 * s.scale}rem`, margin: 0, overflowWrap: "anywhere" }}>{it.value}</dd>
              </div>
            ))}
          </dl>,
        );
      case "message":
        return wrapBlock(
          "message",
          <p style={{ ...body, margin: 0, padding: "0.75rem 0.9rem", borderRadius: Math.min(s.radius, 12), background: b.tone === "accent" ? s.accent : "#F5F5F4", color: b.tone === "accent" ? s.onAccent : s.text, fontWeight: 700, whiteSpace: "pre-line" }}>{b.text}</p>,
        );
      case "info": {
        const content = (
          <div style={{ display: "grid", gap: "0.6rem", paddingTop: "0.4rem" }}>
            {b.items.map((it) => (
              <div key={it.label}>
                <p style={{ ...body, fontWeight: 700, margin: 0, fontSize: `${0.9 * s.scale}rem` }}>{it.label}</p>
                <p style={{ ...body, color: s.muted, margin: 0, fontSize: `${0.9 * s.scale}rem`, whiteSpace: "pre-line" }}>{it.text}</p>
              </div>
            ))}
          </div>
        );
        const title = b.title ?? "Praktische informatie";
        return wrapBlock(
          "info",
          b.collapsed ? (
            <details style={{ borderTop: `1px solid ${s.muted}33`, paddingTop: "0.6rem" }}>
              <summary style={{ ...heading, fontSize: `${1.05 * s.scale}rem`, cursor: "pointer", minHeight: "2.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", listStyle: "none" }}>
                {title}
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="hhc-ticket-chevron">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              {content}
            </details>
          ) : (
            <section style={{ borderTop: `1px solid ${s.muted}33`, paddingTop: "0.6rem" }}>
              {b.title && <h2 style={{ ...heading, fontSize: `${1.05 * s.scale}rem`, margin: 0 }}>{b.title}</h2>}
              {content}
            </section>
          ),
        );
      }
      case "sponsors": {
        const h = b.size === "s" ? "1.75rem" : b.size === "l" ? "3.25rem" : "2.4rem";
        return wrapBlock(
          "sponsors",
          <section aria-label={b.title ?? "Sponsoren"} style={{ borderTop: `1px solid ${s.muted}33`, paddingTop: "0.75rem" }}>
            {b.title && <p style={{ ...body, color: s.muted, fontSize: `${0.75 * s.scale}rem`, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.6rem", textAlign: b.align }}>{b.title}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem 1.4rem", alignItems: "center", justifyContent: b.align === "center" ? "center" : "flex-start" }}>
              {b.logos.map((l) => (
                <img key={l.assetId} src={l.url} alt={l.name} style={{ height: h, width: "auto", maxWidth: "40%", objectFit: "contain" }} />
              ))}
            </div>
          </section>,
        );
      }
      case "extra":
        return wrapBlock(
          "extra",
          <section>
            {b.title && <h2 style={{ ...heading, fontSize: `${1.05 * s.scale}rem`, margin: 0 }}>{b.title}</h2>}
            <p style={{ ...body, color: s.muted, margin: "0.3rem 0 0", whiteSpace: "pre-line" }}>{b.text}</p>
          </section>,
        );
      case "footer":
        return wrapBlock(
          "footer",
          <footer style={{ ...body, borderTop: `2px solid ${s.accent}`, paddingTop: "0.75rem", color: s.muted, fontSize: `${0.75 * s.scale}rem` }}>
            {b.terms && <p style={{ margin: 0 }}>{b.terms}</p>}
            <p style={{ margin: "0.4rem 0 0", color: s.text, fontWeight: 600 }}>
              {L.ticketNumber} {b.ticketNumber}
            </p>
            {(b.contact || b.version) && <p style={{ margin: "0.2rem 0 0" }}>{[b.contact, b.version].filter(Boolean).join(" · ")}</p>}
          </footer>,
        );
    }
  });

  return (
    <div style={{ background: s.page, padding: "0.75rem 0.5rem 2rem", minHeight: "100%" }}>
      <article aria-label="Ticket" style={{ maxWidth: "28rem", margin: "0 auto", background: s.background, color: s.text, borderRadius: s.radius, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.12)", border: s.border ? `1px solid ${s.muted}44` : undefined, ...body }}>
        {view.sample && <p role="note" style={{ margin: 0, background: "#B91C1C", color: "#FFFFFF", textAlign: "center", fontWeight: 700, fontSize: "0.8rem", padding: "0.35rem" }}>{L.sample.toUpperCase()}</p>}
        {view.notices.map((n, i) => (
          <p key={i} role="status" style={{ margin: 0, background: "#FEF3C7", color: "#78350F", fontSize: "0.9rem", padding: "0.75rem 1.15rem", fontWeight: 600 }}>
            {n}
          </p>
        ))}
        {!view.usable && (
          <p role="alert" style={{ margin: 0, background: "#FEE2E2", color: "#7F1D1D", fontSize: "0.95rem", padding: "0.75rem 1.15rem", fontWeight: 700 }}>
            {L.status}: {view.statusLabel}
          </p>
        )}
        <div style={{ display: "grid", gap, paddingBottom: "1.25rem" }}>{blocks}</div>
      </article>
      {offline && <OfflineSave labels={L} />}
      {!view.sample && <p style={{ ...body, maxWidth: "28rem", margin: "0.75rem auto 0", textAlign: "center", fontSize: "0.8rem", color: "#57534E" }}>{L.personalNote}</p>}
      {qrOpen && qr && <QrDialog code={qr.code} sample={qr.sample} title={match?.title ?? ""} name={holder?.name ?? ""} type={type?.label ?? ""} labels={L} onClose={() => setQrOpen(false)} />}
    </div>
  );
}

function QrDialog({ code, sample, title, name, type, labels, onClose }: { code: string; sample: boolean; title: string; name: string; type: string; labels: MobileLabels; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus();
      }
    },
    [onClose],
  );
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Scherm aan houden zolang de code groot in beeld is (waar de browser dat ondersteunt).
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      lock?.release().catch(() => {});
      prev?.focus();
    };
  }, [onKey]);
  return (
    <div role="dialog" aria-modal="true" aria-label={labels.qrDialog} style={{ position: "fixed", inset: 0, zIndex: 50, background: "#FFFFFF", color: "#000000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", gap: "0.75rem", overflowY: "auto" }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem", textAlign: "center", overflowWrap: "anywhere" }}>{title}</p>
      <div style={{ width: "min(92vw, calc(100vh - 14rem), 30rem)" }}>
        <QrSvg code={code} label={sample ? "QR-code (voorbeeld, geeft geen toegang)" : "QR-code van je ticket"} />
      </div>
      <p style={{ margin: 0, fontWeight: 800, fontSize: "1.25rem", textAlign: "center", overflowWrap: "anywhere" }}>{name}</p>
      <p style={{ margin: 0, fontWeight: 600, textAlign: "center" }}>{type}</p>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "#44403C", textAlign: "center" }}>{labels.brightness}</p>
      <button ref={closeRef} type="button" onClick={onClose} style={{ minHeight: "3rem", minWidth: "10rem", borderRadius: 12, border: "2px solid #000000", background: "#FFFFFF", fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}>
        {labels.close}
      </button>
    </div>
  );
}

/** Offline bewaren: de service worker bewaart de pagina en de pdf; tonen kan zonder internet, de geldigheid bepaalt de scanner. */
function OfflineSave({ labels }: { labels: MobileLabels }) {
  const [state, setState] = useState<"idle" | "saved" | "unsupported">(() => (typeof navigator !== "undefined" && !("serviceWorker" in navigator) ? "unsupported" : "idle"));
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    const sync = () => setIsOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/t-sw.js", { scope: "/t/" }).catch(() => setState("unsupported"));
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  const save = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const urls = [location.pathname + location.search, ...[...document.querySelectorAll("a[href*='/pdf']")].map((a) => (a as HTMLAnchorElement).pathname)];
      reg.active?.postMessage({ type: "save", urls });
      const cache = await caches.open("hhc-ticket-v2");
      await Promise.all(urls.map((u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? cache.put(u, r) : undefined)).catch(() => undefined)));
      setState("saved");
    } catch {
      setState("unsupported");
    }
  };
  return (
    <div style={{ maxWidth: "28rem", margin: "0.75rem auto 0", display: "grid", gap: "0.4rem", padding: "0 0.25rem" }}>
      {isOffline && <p role="status" style={{ margin: 0, background: "#FEF3C7", color: "#78350F", padding: "0.6rem 0.8rem", borderRadius: 10, fontSize: "0.9rem" }}>{labels.offlineValidity}</p>}
      {state !== "unsupported" && (
        <button type="button" onClick={save} disabled={state === "saved"} style={{ minHeight: "3rem", borderRadius: 12, border: "2px solid #44403C", background: "#FFFFFF", color: "#1C1917", fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}>
          {state === "saved" ? labels.savedOffline : labels.saveOffline}
        </button>
      )}
      <p style={{ margin: 0, fontSize: "0.8rem", color: "#57534E", textAlign: "center" }}>{labels.offlineSaveHelp}</p>
    </div>
  );
}
