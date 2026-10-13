// Kleine fetch-hulp voor de commerciële schermen. Toont de foutmelding van de server
// letterlijk (die is bedoeld voor gebruikers) en meldt nooit succes bij een mislukte aanvraag.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function api<T = unknown>(url: string, method = "GET", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: data as T };
    const err = (data as { error?: unknown }).error;
    return { ok: false, status: res.status, error: typeof err === "string" ? err : "Er is iets misgegaan." };
  } catch {
    return { ok: false, status: 0, error: "Geen verbinding. Probeer het opnieuw." };
  }
}

/** Datum als dd/mm/yyyy (Nederlandse tijd), desgewenst met " hh:mm". */
export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "–";
  const parts = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  }).formatToParts(new Date(iso));
  const v = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)?.value ?? "";
  const day = `${v("day")}/${v("month")}/${v("year")}`;
  return withTime ? `${day} ${v("hour")}:${v("minute")}` : day;
}

/** Waarde voor <input type="datetime-local"> in Nederlandse tijd. */
export function toLocalInput(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }).format(d);
  return p.replace(" ", "T");
}

/** Eurocenten naar "€ 2.500,00". */
export function formatEuro(cents: number | null | undefined): string {
  if (cents == null) return "–";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** "2.500,50" of "2500.50" naar eurocenten; null bij ongeldige invoer. Lege invoer geeft undefined. */
export function parseEuro(input: string): number | null | undefined {
  const t = input.trim().replace(/[€\s]/g, "");
  if (t === "") return undefined;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}
