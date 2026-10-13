// Eén datumnotatie voor de hele Hub: dd/mm/jjjj (en dd/mm/jjjj uu:mm met tijd), in Nederlandse tijd.
// Zonder server-only imports: ook in de browser, in e-mails, pdf's en exports te gebruiken.

const TZ = "Europe/Amsterdam";
const PLAIN_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(d: Date, withTime: boolean) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}) })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return p as Record<string, string>;
}

/** "2026-10-13" of een Date/ISO-tijdstip → "13/10/2026". Leeg geeft `fallback`. */
export function formatDay(value: string | Date | null | undefined, fallback = "–"): string {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") {
    // Kale kalenderdatum: niet via Date, anders kan de tijdzone een dag verschuiven.
    const m = PLAIN_DAY.exec(value);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : fallback;
  const p = parts(d, false);
  return `${p.day}/${p.month}/${p.year}`;
}

/** Tijdstip → "13/10/2026 14:30" in Nederlandse tijd. */
export function formatDayTime(value: string | Date | null | undefined, fallback = "–"): string {
  if (value == null || value === "") return fallback;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : fallback;
  const p = parts(d, true);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Datum-fns-patroon voor dezelfde notatie, voor plekken die al met date-fns werken. */
export const DAY_PATTERN = "dd/MM/yyyy";
