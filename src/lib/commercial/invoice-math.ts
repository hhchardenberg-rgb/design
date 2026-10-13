// Zuivere berekeningen en validaties voor facturen (zonder database).

export const VAT_RATES_BP = [0, 900, 2100] as const; // 0%, 9%, 21%

export interface MathLine { quantity: number; unitCents: number; vatRateBp: number | null }

export interface VatGroup { vatRateBp: number; netCents: number; vatCents: number }

/**
 * Btw wordt per tarief berekend over het totaal van de nettobedragen en dan afgerond
 * (niet per regel), zodat afrondingsverschillen niet optellen.
 */
export function totalsOf(lines: MathLine[]): { groups: VatGroup[]; netCents: number; vatCents: number; grossCents: number } {
  const byRate = new Map<number, number>();
  for (const l of lines) {
    if (l.vatRateBp == null) continue;
    byRate.set(l.vatRateBp, (byRate.get(l.vatRateBp) ?? 0) + l.quantity * l.unitCents);
  }
  const groups = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([vatRateBp, netCents]) => ({ vatRateBp, netCents, vatCents: Math.round((netCents * vatRateBp) / 10_000) }));
  const netCents = groups.reduce((a, g) => a + g.netCents, 0);
  const vatCents = groups.reduce((a, g) => a + g.vatCents, 0);
  return { groups, netCents, vatCents, grossCents: netCents + vatCents };
}

/** Controle van een IBAN (lengte, landcode en mod-97). */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" ? ch.charCodeAt(0) - 55 : Number(ch);
    rest = Number(`${rest}${v}`) % 97;
  }
  return rest === 1;
}

export const normalizeIban = (raw: string) => raw.replace(/\s+/g, "").toUpperCase();

/** Nederlands btw-identificatienummer: NL, negen cijfers, B en twee cijfers. */
export const isValidDutchVatNumber = (raw: string) => /^NL\d{9}B\d{2}$/.test(raw.replace(/[\s.]+/g, "").toUpperCase());
export const normalizeVatNumber = (raw: string) => raw.replace(/[\s.]+/g, "").toUpperCase();

export const isValidKvk = (raw: string) => /^\d{8}$/.test(raw.trim());

/** Documentnummer: voorvoegsel plus doorlopend nummer met minimaal vier cijfers. */
export const formatDocumentNumber = (prefix: string | null | undefined, n: number) => `${prefix ?? ""}${String(n).padStart(4, "0")}`;

/** Opteldatum zonder tijdzoneproblemen: YYYY-MM-DD plus dagen. */
export function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
