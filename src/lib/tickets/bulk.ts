import { detectDelimiter, parseCsv } from "@/lib/commercial/csv";
import { holderSchema, type HolderInput } from "./schemas";

// Inlezen van een bulkbestand (CSV, of rijen uit Excel). De eerste rij zijn de kolomnamen;
// herkend in het Nederlands en Engels, hoofdletters en leestekens maken niet uit.
// Persoonsgegevens worden hier alleen gecontroleerd, niet opgeslagen.

const COLUMNS: Record<keyof HolderInput, string[]> = {
  firstName: ["voornaam", "firstname", "first name", "roepnaam"],
  lastName: ["achternaam", "lastname", "last name", "naam", "surname"],
  email: ["email", "e-mail", "e-mailadres", "emailadres", "mail"],
  phone: ["telefoon", "telefoonnummer", "phone", "mobiel", "gsm"],
  company: ["bedrijf", "bedrijfsnaam", "company", "organisatie"],
  relation: ["relatie", "sponsor", "relatie of sponsor", "relation"],
  note: ["opmerking", "opmerkingen", "notitie", "note", "notes"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const LOOKUP = new Map<string, keyof HolderInput>();
for (const [key, names] of Object.entries(COLUMNS) as [keyof HolderInput, string[]][]) for (const n of names) LOOKUP.set(norm(n), key);

export const BULK_TEMPLATE_HEADER = ["Voornaam", "Achternaam", "E-mailadres", "Telefoon", "Bedrijf", "Relatie", "Opmerking"];

export interface BulkRowError {
  row: number;
  message: string;
}

export interface BulkParseResult {
  holders: HolderInput[];
  errors: BulkRowError[];
  unknownColumns: string[];
  duplicates: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rijen (eerste = kop) naar tickethouders, met foutmeldingen per regel. */
export function parseBulkRows(rows: string[][], maxRows = 2000): BulkParseResult {
  // Lege regels overslaan, maar het regelnummer uit het bestand bewaren voor de foutmeldingen.
  const [first, ...rest] = rows.map((cells, i) => ({ cells, line: i + 1 })).filter((r) => r.cells.some((c) => c.trim() !== ""));
  const head = first?.cells;
  const body = rest.map((r) => r.cells);
  const lines = rest.map((r) => r.line);
  if (!head) return { holders: [], errors: [{ row: 1, message: "Het bestand is leeg." }], unknownColumns: [], duplicates: 0 };
  const map = head.map((h) => LOOKUP.get(norm(h)) ?? null);
  const unknownColumns = head.filter((_, i) => !map[i] && head[i].trim() !== "");
  const errors: BulkRowError[] = [];
  if (!map.includes("firstName") || !map.includes("lastName")) {
    return { holders: [], errors: [{ row: 1, message: "De kolommen Voornaam en Achternaam zijn verplicht." }], unknownColumns, duplicates: 0 };
  }
  if (body.length > maxRows) errors.push({ row: 1, message: `Maximaal ${maxRows} regels per bestand; dit bestand heeft er ${body.length}.` });

  const holders: HolderInput[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  body.slice(0, maxRows).forEach((cells, i) => {
    const line = lines[i];
    const h: Record<string, string | null> = { firstName: "", lastName: "", email: null, phone: null, company: null, relation: null, note: null };
    map.forEach((key, col) => {
      if (!key) return;
      const v = (cells[col] ?? "").trim();
      h[key] = v === "" ? (key === "firstName" || key === "lastName" ? "" : null) : v;
    });
    if (!h.firstName || !h.lastName) return errors.push({ row: line, message: "Voornaam en achternaam zijn verplicht." });
    if (h.email) h.email = h.email.toLowerCase();
    if (h.email && !EMAIL.test(h.email)) return errors.push({ row: line, message: `Ongeldig e-mailadres: ${h.email}` });
    if ((h.firstName?.length ?? 0) > 60 || (h.lastName?.length ?? 0) > 80) return errors.push({ row: line, message: "Naam is te lang." });
    if ((h.note?.length ?? 0) > 500) return errors.push({ row: line, message: "Opmerking is te lang (maximaal 500 tekens)." });
    if ((h.phone?.length ?? 0) > 30) return errors.push({ row: line, message: "Telefoonnummer is te lang (maximaal 30 tekens)." });
    if ((h.company?.length ?? 0) > 120 || (h.relation?.length ?? 0) > 120) return errors.push({ row: line, message: "Bedrijf of relatie is te lang (maximaal 120 tekens)." });
    // Laatste vangnet: precies dezelfde controle als bij het uitgeven, zodat een goedgekeurd bestand daar nooit alsnog faalt.
    const checked = holderSchema.safeParse(h);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      return errors.push({ row: line, message: issue?.path[0] === "email" ? `Ongeldig e-mailadres: ${h.email}` : "Deze regel bevat ongeldige gegevens." });
    }
    const key = `${norm(h.firstName!)}|${norm(h.lastName!)}|${h.email ?? ""}`;
    if (seen.has(key)) duplicates++;
    seen.add(key);
    holders.push(h as unknown as HolderInput);
  });
  return { holders, errors, unknownColumns, duplicates };
}

export function parseBulkCsv(text: string, maxRows?: number): BulkParseResult {
  const clean = text.replace(/^﻿/, "");
  return parseBulkRows(parseCsv(clean, detectDelimiter(clean), { keepEmpty: true }), maxRows);
}

/**
 * Tekst van een geüpload CSV-bestand. UTF-8 (met of zonder BOM) als dat klopt; anders Windows-1252,
 * want Excel op een Nederlandse Windows-pc slaat "CSV (gescheiden door lijstscheidingsteken)" zo op.
 * Zonder deze terugval worden é, ü en ë stilletjes vervangen door een vraagteken-ruit.
 */
export function decodeBulkText(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
