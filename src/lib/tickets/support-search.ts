// Pure hulpfuncties voor de zoektool in Klantenservice (zonder database), zodat ze in tests
// en in de browser bruikbaar zijn.

export type SupportSearchKind = "auto" | "name" | "email" | "ticket" | "order";
export type ResolvedKind = Exclude<SupportSearchKind, "auto">;

export const SUPPORT_KIND_LABELS: Record<SupportSearchKind, string> = {
  auto: "Automatisch",
  name: "Naam",
  email: "E-mailadres",
  ticket: "Ticket- of kaartnummer",
  order: "Ordernummer",
};

/** Ticketkenmerk van een HHC-ticket (Crockford base32, 16 tekens). */
const HHC_PUBLIC_ID = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/;
/** Een volledige HHC-QR (HHC1.<kenmerk>.<versie>.<handtekening>). */
const HHC_QR = /^HHC1\.([0-9ABCDEFGHJKMNPQRSTVWXYZ]{16})\.\d+\.[A-Za-z0-9_-]+$/i;
/** vivenu-id (MongoDB ObjectId): zo ziet een Fullhouse-ordernummer eruit. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Raadt wat er is ingetypt. Bij twijfel naam (daar zoeken beide bronnen op). */
export function detectKind(raw: string): ResolvedKind {
  const q = raw.trim();
  if (q.includes("@")) return "email";
  if (HHC_QR.test(q)) return "ticket";
  if (OBJECT_ID.test(q)) return "order";
  if (HHC_PUBLIC_ID.test(q.toUpperCase()) && /\d/.test(q)) return "ticket";
  // Barcodes en kaartnummers: geen spaties en minstens één cijfer.
  if (!/\s/.test(q) && /\d/.test(q) && q.length >= 4) return "ticket";
  return "name";
}

/** Haalt het HHC-ticketkenmerk uit een geplakte QR-tekst, of geeft de invoer in hoofdletters terug. */
export function hhcPublicIdFrom(raw: string): string {
  const q = raw.trim();
  const m = HHC_QR.exec(q);
  return (m ? m[1] : q).toUpperCase();
}

/** Minimale lengte per soort, zodat niemand met één letter de hele klantenlijst doorbladert. */
export function validateTerm(kind: ResolvedKind, raw: string): string | null {
  const q = raw.trim();
  if (kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(q) ? null : "Vul een volledig e-mailadres in.";
  if (kind === "name") return q.replace(/\s/g, "").length >= 3 ? null : "Vul minstens 3 letters van de naam in.";
  if (kind === "ticket") return q.length >= 4 ? null : "Vul minstens 4 tekens van het ticket- of kaartnummer in.";
  return q.length >= 4 ? null : "Vul het volledige ordernummer in.";
}

/** j•••@gmail.com: genoeg om met de klant te controleren, niet om over te nemen. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 1)}•••@${domain}`;
}

/** Barcode van een Fullhouse-ticket: alleen de laatste 4 tekens, zodat niemand er een toegangsbewijs van kan maken. */
export function maskBarcode(code: string | null | undefined): string | null {
  if (!code) return null;
  return code.length <= 4 ? "••••" : `••••${code.slice(-4)}`;
}

/** Zoekterm zoals hij in het auditlog komt: soort plus een gemaskeerde vorm, nooit de volledige term. */
export function maskTerm(kind: ResolvedKind, raw: string): string {
  const q = raw.trim();
  if (kind === "email") return maskEmail(q.toLowerCase()) ?? "•••";
  if (kind === "name") return q.split(/\s+/).map((p) => `${p.slice(0, 1)}•••`).join(" ");
  return q.length <= 4 ? "••••" : `••••${q.slice(-4)}`;
}

/** Status in gewone taal voor de zoektool. */
export type SupportStatus = "VALID" | "SCANNED" | "REVOKED" | "CANCELLED_EVENT" | "EXPIRED" | "RESERVED" | "DETAILS" | "UNKNOWN";

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  VALID: "Geldig",
  SCANNED: "Gescand",
  REVOKED: "Ingetrokken",
  CANCELLED_EVENT: "Afgelast",
  EXPIRED: "Verlopen",
  RESERVED: "Gereserveerd",
  DETAILS: "Gegevens nodig",
  UNKNOWN: "Onbekend",
};

/**
 * Eén status per ticket, in deze volgorde: ingetrokken gaat voor alles, dan afgelast,
 * dan verlopen, dan gescand (bij de gekozen wedstrijd binnen geweest), anders geldig.
 */
export function hhcSupportStatus(t: { status: string; expired: boolean; allEventsCancelled: boolean; scanned: boolean }): SupportStatus {
  if (t.status === "BLOCKED" || t.status === "CANCELLED") return "REVOKED";
  if (t.allEventsCancelled) return "CANCELLED_EVENT";
  if (t.expired) return "EXPIRED";
  if (t.scanned) return "SCANNED";
  return "VALID";
}

export function fullhouseSupportStatus(t: { status: string; eventCancelled: boolean; scanned: boolean }): SupportStatus {
  if (t.status === "INVALID" || t.status === "BLANK") return "REVOKED";
  if (t.eventCancelled) return "CANCELLED_EVENT";
  if (t.status === "RESERVED") return "RESERVED";
  if (t.status === "DETAILSREQUIRED") return "DETAILS";
  if (t.status !== "VALID") return "UNKNOWN";
  return t.scanned ? "SCANNED" : "VALID";
}

/** Groepeert tickets per klant: op e-mailadres, anders op naam. */
export function groupByCustomer<T extends { email: string | null; name: string | null }>(rows: T[]): { key: string; name: string | null; email: string | null; tickets: T[] }[] {
  const map = new Map<string, { key: string; name: string | null; email: string | null; tickets: T[] }>();
  for (const r of rows) {
    const key = r.email ? `e:${r.email.trim().toLowerCase()}` : r.name ? `n:${r.name.trim().toLowerCase()}` : "onbekend";
    const g = map.get(key) ?? { key, name: r.name, email: r.email, tickets: [] };
    if (!g.name && r.name) g.name = r.name;
    g.tickets.push(r);
    map.set(key, g);
  }
  return [...map.values()];
}
