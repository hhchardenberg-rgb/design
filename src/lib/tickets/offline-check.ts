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
  | { result: "VALID"; reason: null; label: string; reentry: boolean }
  | { result: "WARNING"; reason: "ALREADY_USED"; label: string; reentry: false; previousAt: string }
  | { result: "INVALID"; reason: "NOT_FOUND" | "WRONG_ZONE" | "EVENT_NOT_ACTIVE"; label: null; reentry: false };

const HHC_RE = /^HHC1\.([0-9A-HJKMNP-TV-Z]{16})\.([1-9]\d{0,5})\.[A-Za-z0-9_-]{22}$/i;

export function parseHhcCode(code: string): { publicId: string; version: number } | null {
  const m = HHC_RE.exec(code.trim());
  return m ? { publicId: m[1].toUpperCase(), version: Number(m[2]) } : null;
}

export function cacheExpired(cache: Pick<OfflineCache, "expiresAt">, now = new Date()): boolean {
  return now.getTime() > new Date(cache.expiresAt).getTime();
}

/**
 * `sha256Hex` is de hash van de gescande code (alleen nodig voor Fullhouse-codes).
 * `usedLocally` bevat de sleutels die op dit apparaat al zijn toegelaten sinds het laden.
 */
export function checkOffline(cache: OfflineCache, code: string, sha256Hex: string | null, usedLocally: Map<string, string>, entranceZoneId: string | null = null, now = new Date()): OfflineResult {
  if (cacheExpired(cache, now)) return { result: "INVALID", reason: "EVENT_NOT_ACTIVE", label: null, reentry: false };
  const usedAt = new Map<string, string>();
  for (const u of cache.used) if (u.k) usedAt.set(u.k, u.at);
  for (const [k, at] of usedLocally) usedAt.set(k, at);

  const ref = parseHhcCode(code);
  let key: string | null = null;
  let label: string | null = null;
  let reentry = false;
  if (ref) {
    const t = cache.hhc.find((x) => x.p === ref.publicId && x.v === ref.version);
    if (!t) return { result: "INVALID", reason: "NOT_FOUND", label: null, reentry: false };
    if (t.z && entranceZoneId && t.z !== entranceZoneId) return { result: "INVALID", reason: "WRONG_ZONE", label: null, reentry: false };
    key = t.p;
    label = t.l;
    reentry = t.r;
  } else if (sha256Hex) {
    const t = cache.fullhouse.find((x) => x.h === sha256Hex);
    if (!t) return { result: "INVALID", reason: "NOT_FOUND", label: null, reentry: false };
    key = sha256Hex;
    label = t.l;
  }
  if (!key || label === null) return { result: "INVALID", reason: "NOT_FOUND", label: null, reentry: false };
  const prev = usedAt.get(key);
  if (prev && !reentry) return { result: "WARNING", reason: "ALREADY_USED", label, reentry: false, previousAt: prev };
  return { result: "VALID", reason: null, label, reentry: !!prev };
}
