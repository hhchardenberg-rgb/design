// Beoordeling van een scan zonder verbinding, op het apparaat zelf. Pure functies, zodat
// ze getest kunnen worden. Dit is bewust voorzichtiger dan de server: een code die niet in
// de lijst staat wordt geweigerd, en de server beoordeelt alles opnieuw bij het terugmelden.
// De handtekening van een HHC-QR kan hier niet gecontroleerd worden (de sleutel blijft op de
// server); de 80-bits willekeurige ticketkenmerken maken raden onmogelijk.

export interface OfflineCache {
  event: { id: string; title: string };
  generatedAt: string;
  expiresAt: string;
  hhc: { p: string; v: number; l: string; z: string | null; r: boolean }[];
  fullhouse: { h: string; l: string }[];
  used: { k: string | null; at: string }[];
}

export type OfflineResult =
  | { result: "VALID"; reason: null; label: string; reentry: boolean; key: string; previousAt: string | null }
  | { result: "WARNING"; reason: "ALREADY_USED"; label: string; reentry: false; previousAt: string; key: string }
  | { result: "INVALID"; reason: "NOT_FOUND" | "WRONG_ZONE" | "EVENT_NOT_ACTIVE" | "NUMBER_NOT_ALLOWED"; label: null; reentry: false; key: null };

const HHC_RE = /^HHC1\.([0-9A-HJKMNP-TV-Z]{16})\.([1-9]\d{0,5})\.[A-Za-z0-9_-]{22}$/i;

export function parseHhcCode(code: string): { publicId: string; version: number } | null {
  const m = HHC_RE.exec(code.trim());
  return m ? { publicId: m[1].toUpperCase(), version: Number(m[2]) } : null;
}

/** Een getypt ticketnummer (XXXX-XXXX-XXXX-XXXX) als ticketkenmerk, anders null. Zelfde regel als op de server. */
export function ticketNumberFrom(code: string): string | null {
  const n = code.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(n) ? n : null;
}

/** De sleutel waaronder een toegelaten ticket lokaal wordt onthouden: ticketkenmerk (HHC) of hash van de barcode. */
export function scanKey(code: string, sha256Hex: string | null): string | null {
  return parseHhcCode(code)?.publicId ?? sha256Hex;
}

/**
 * Vaste testcodes om de scanner te proberen, ook in productie. Ze geven nooit toegang tot een echt
 * ticket, worden niet als scan opgeslagen en tellen nergens mee (alleen een regel in het auditlog).
 * FH-TEST-0001 toont groen, FH-TEST-DOWN toont "Fullhouse niet bereikbaar".
 */
export const TEST_CODES = { "FH-TEST-0001": "VALID", "FH-TEST-DOWN": "PROVIDER_DOWN" } as const;
export type TestCode = keyof typeof TEST_CODES;
export const isTestCode = (code: string): code is TestCode => Object.prototype.hasOwnProperty.call(TEST_CODES, code.trim().toUpperCase());
export const TEST_LABEL = "Testcode · geen echte toegang";
export const TEST_DETAIL = "Dit is een testcode. Er is niets geregistreerd en niemand telt als binnen.";

export function cacheExpired(cache: Pick<OfflineCache, "expiresAt">, now = new Date()): boolean {
  return now.getTime() > new Date(cache.expiresAt).getTime();
}

/**
 * `sha256Hex` is de hash van de gescande code (alleen nodig voor Fullhouse-codes).
 * `usedLocally` bevat de sleutels die op dit apparaat al zijn toegelaten sinds het laden.
 */
export function checkOffline(cache: OfflineCache, code: string, sha256Hex: string | null, usedLocally: Map<string, string>, entranceZoneId: string | null = null, now = new Date(), opts: { allowNumber?: boolean } = {}): OfflineResult {
  const invalid = (reason: "NOT_FOUND" | "WRONG_ZONE" | "EVENT_NOT_ACTIVE" | "NUMBER_NOT_ALLOWED"): OfflineResult => ({ result: "INVALID", reason, label: null, reentry: false, key: null });
  if (cacheExpired(cache, now)) return invalid("EVENT_NOT_ACTIVE");
  const usedAt = new Map<string, string>();
  for (const u of cache.used) if (u.k) usedAt.set(u.k, u.at);
  for (const [k, at] of usedLocally) usedAt.set(k, at);

  let ref: { publicId: string; version: number | null } | null = parseHhcCode(code);
  if (!ref) {
    // Getypt ticketnummer: alleen voor supervisors, en alleen als het in de lijst staat (anders kan het een Fullhouse-barcode zijn).
    const number = ticketNumberFrom(code);
    if (number && cache.hhc.some((x) => x.p === number)) {
      if (!opts.allowNumber) return invalid("NUMBER_NOT_ALLOWED");
      ref = { publicId: number, version: null };
    }
  }
  let key: string | null = null;
  let label: string | null = null;
  let reentry = false;
  if (ref) {
    const r = ref;
    const t = cache.hhc.find((x) => x.p === r.publicId && (r.version === null || x.v === r.version));
    if (!t) return invalid("NOT_FOUND");
    if (t.z && entranceZoneId && t.z !== entranceZoneId) return invalid("WRONG_ZONE");
    key = t.p;
    label = t.l;
    reentry = t.r;
  } else if (sha256Hex) {
    const t = cache.fullhouse.find((x) => x.h === sha256Hex);
    if (!t) return invalid("NOT_FOUND");
    key = sha256Hex;
    label = t.l;
  }
  if (!key || label === null) return invalid("NOT_FOUND");
  const prev = usedAt.get(key);
  if (prev && !reentry) return { result: "WARNING", reason: "ALREADY_USED", label, reentry: false, previousAt: prev, key };
  return { result: "VALID", reason: null, label, reentry: !!prev, key, previousAt: prev ?? null };
}
