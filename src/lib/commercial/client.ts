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

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Waarde voor <input type="datetime-local"> in Nederlandse tijd. */
export function toLocalInput(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }).format(d);
  return p.replace(" ", "T");
}
