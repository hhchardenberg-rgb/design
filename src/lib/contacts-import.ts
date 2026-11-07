/**
 * Leest een geplakte lijst contactpersonen (bv. uit Excel, Word of een mail) in.
 *
 * Per regel: functie, naam en telefoonnummer. Kolommen mogen gescheiden zijn door een tab, `;` of `|`.
 * Staan naam en telefoon samen in één kolom ("Jan Jansen +31 6 12345678"), dan wordt het nummer
 * achteraan de kolom herkend. Een kopregel ("Functie / Naam / Telefoon") en lege regels worden
 * overgeslagen.
 */

export interface ParsedContactRow {
  line: number;
  role: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface ParseResult {
  rows: ParsedContactRow[];
  errors: { line: number; text: string; reason: string }[];
}

const PHONE_AT_END = /(\+?\(?\d[\d\s\-()]{6,}\d)\s*$/;
const EMAIL = /[^\s;|,<>]+@[^\s;|,<>]+\.[a-z]{2,}/i;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeName(name: string): string {
  return clean(name)
    .toLocaleLowerCase("nl")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function isHeader(parts: string[]): boolean {
  const lower = parts.map((p) => p.toLowerCase());
  return lower.some((p) => p === "naam") && lower.some((p) => p === "functie" || p === "rol");
}

export function parseContactList(input: string): ParseResult {
  const rows: ParsedContactRow[] = [];
  const errors: ParseResult["errors"] = [];

  input.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;

    const separator = raw.includes("\t") ? "\t" : raw.includes(";") ? ";" : raw.includes("|") ? "|" : null;
    let parts = (separator ? raw.split(separator) : [raw]).map(clean).filter(Boolean);
    if (isHeader(parts)) return;

    let email: string | null = null;
    parts = parts
      .map((p) => {
        const match = p.match(EMAIL);
        if (match && !email) {
          email = match[0];
          return clean(p.replace(match[0], ""));
        }
        return p;
      })
      .filter(Boolean);

    let phone: string | null = null;
    const last = parts[parts.length - 1] ?? "";
    if (parts.length >= 3 && /^[+\d(][\d\s\-()]+$/.test(last)) {
      phone = last;
      parts = parts.slice(0, -1);
    } else {
      const match = last.match(PHONE_AT_END);
      if (match) {
        phone = clean(match[1]);
        const rest = clean(last.slice(0, match.index));
        parts = rest ? [...parts.slice(0, -1), rest] : parts.slice(0, -1);
      }
    }

    if (parts.length < 2) {
      errors.push({ line, text: raw.trim(), reason: "Functie en naam niet te onderscheiden. Zet er een tab of ; tussen." });
      return;
    }

    const name = parts[parts.length - 1];
    const role = parts.slice(0, -1).join(" - ");
    rows.push({ line, role, name, phone, email });
  });

  return { rows, errors };
}
