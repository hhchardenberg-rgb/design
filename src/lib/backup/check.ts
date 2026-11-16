import { formatDay, formatDayTime } from "@/lib/date-format";

/**
 * Wekelijkse back-upcontrole: de beoordeling zelf, zonder database of opslag (zie check.server.ts
 * voor het verzamelen van de gegevens). Zo is de logica los te testen.
 *
 *  - ok:   in orde
 *  - info: ter informatie, telt niet als probleem (bv. "geen externe opslag ingesteld")
 *  - warn: aandacht nodig, maar er is nog een bruikbare back-up
 *  - fail: er is op dit moment geen zekerheid dat de gegevens terug te zetten zijn
 */
export type CheckStatus = "ok" | "info" | "warn" | "fail";

export interface CheckItem {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface BackupCheckReport {
  at: string;
  status: "ok" | "warn" | "fail";
  items: CheckItem[];
}

/** Een back-up ouder dan dit (uren) telt als "te oud". Gelijk aan de waarschuwing op het beheerscherm. */
export const CHECK_STALE_HOURS = 36;
/** Gratis Neon-plan: ongeveer zoveel branches (inclusief main) kunnen er tegelijk zijn. */
export const NEON_BRANCH_LIMIT = 10;

export interface RunSummary {
  id: string;
  status: string;
  startedAt: Date;
  keyId: string | null;
  storageKey: string | null;
  prunedAt: Date | null;
  target: string | null;
  rowCount: number | null;
  tableCount: number | null;
  filesPending: number | null;
}

export interface RestoreTest {
  runId: string;
  ok: boolean;
  /** Bij succes: wat er in het bestand zat. */
  rows?: number;
  tables?: number;
  error?: string;
}

export interface NeonState {
  /** Niet ingesteld (geen NEON_API_KEY): dan wordt dit onderdeel overgeslagen. */
  configured: boolean;
  error?: string;
  mainReady?: boolean;
  historyHours?: number;
  branchCount?: number;
}

export interface CheckInput {
  now: Date;
  configProblems: string[];
  target: "s3" | "blob" | null;
  mirrorsFiles: boolean;
  currentKeyId: string | null;
  runs: RunSummary[];
  restore: RestoreTest | null;
  neon: NeonState;
}

const DAY_MS = 86_400_000;

/** Kalenderdag (Nederlandse tijd) als "jjjj-mm-dd", om nachten te tellen. */
function nlDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`;
}

export function evaluateBackupCheck(input: CheckInput): BackupCheckReport {
  const { now, runs } = input;
  const items: CheckItem[] = [];
  const ok = runs.filter((r) => r.status === "OK").sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const newest = ok[0] ?? null;

  // 1. Instellingen
  items.push(
    input.configProblems.length
      ? { key: "config", label: "Instellingen", status: "fail", detail: input.configProblems.join(" ") }
      : { key: "config", label: "Instellingen", status: "ok", detail: "Versleutelsleutel en opslag zijn ingesteld." },
  );

  // 2. Laatste geslaagde back-up
  if (!newest) {
    items.push({ key: "latest", label: "Laatste back-up", status: "fail", detail: "Er is nog geen enkele geslaagde back-up." });
  } else {
    const hours = (now.getTime() - newest.startedAt.getTime()) / 3_600_000;
    items.push(
      hours > CHECK_STALE_HOURS
        ? { key: "latest", label: "Laatste back-up", status: "fail", detail: `De laatste geslaagde back-up is van ${formatDayTime(newest.startedAt)}, langer dan anderhalve dag geleden.` }
        : { key: "latest", label: "Laatste back-up", status: "ok", detail: `Gelukt op ${formatDayTime(newest.startedAt)}.` },
    );
  }

  // 3. Afgelopen 7 nachten: elke dag minstens één geslaagde back-up (vandaag telt niet mee als de nacht nog moet komen).
  const okDays = new Set(ok.map((r) => nlDay(r.startedAt)));
  const firstEver = runs.length ? new Date(Math.min(...runs.map((r) => r.startedAt.getTime()))) : null;
  const missed: Date[] = [];
  for (let i = 1; i <= 7; i++) {
    const day = new Date(now.getTime() - i * DAY_MS);
    if (firstEver && nlDay(day) < nlDay(firstEver)) continue; // vóór de allereerste back-up
    if (!okDays.has(nlDay(day))) missed.push(day);
  }
  if (!firstEver) {
    items.push({ key: "week", label: "Afgelopen week", status: "fail", detail: "Er zijn nog geen back-ups gemaakt." });
  } else if (missed.length === 0) {
    items.push({ key: "week", label: "Afgelopen week", status: "ok", detail: "Elke nacht is er een back-up gemaakt." });
  } else {
    const days = missed.reverse().map((d) => formatDay(d)).join(", ");
    items.push({
      key: "week",
      label: "Afgelopen week",
      status: missed.length >= 3 ? "fail" : "warn",
      detail: `Geen geslaagde back-up op ${days}.`,
    });
  }

  // 4. Proefopening van de nieuwste back-up: downloaden, ontsleutelen, uitpakken en alle rijen tellen.
  if (input.restore) {
    const r = input.restore;
    const run = runs.find((x) => x.id === r.runId);
    const when = run ? formatDayTime(run.startedAt) : "de nieuwste back-up";
    if (!r.ok) {
      items.push({ key: "restore", label: "Proefopening", status: "fail", detail: `De back-up van ${when} kon niet geopend worden: ${r.error ?? "onbekende fout"}.` });
    } else if (run && run.rowCount != null && r.rows !== run.rowCount) {
      items.push({
        key: "restore",
        label: "Proefopening",
        status: "fail",
        detail: `De back-up van ${when} bevat ${plural(r.rows ?? 0, "rij", "rijen")}, maar bij het maken waren het er ${run.rowCount.toLocaleString("nl-NL")}.`,
      });
    } else {
      items.push({
        key: "restore",
        label: "Proefopening",
        status: "ok",
        detail: `De back-up van ${when} is gedownload, ontsleuteld en volledig gelezen: ${plural(r.rows ?? 0, "rij", "rijen")} uit ${plural(r.tables ?? 0, "tabel", "tabellen")}.`,
      });
    }
  } else if (newest) {
    items.push({ key: "restore", label: "Proefopening", status: "warn", detail: "De nieuwste back-up is niet geopend (staat niet in de huidige opslag)." });
  }

  // 5. Sleutel: kunnen alle bewaarde back-ups met de huidige sleutel geopend worden?
  const kept = ok.filter((r) => !r.prunedAt && r.storageKey);
  if (input.currentKeyId && kept.length) {
    const other = kept.filter((r) => r.keyId && r.keyId !== input.currentKeyId);
    items.push(
      other.length
        ? {
            key: "key",
            label: "Sleutel",
            status: "warn",
            detail: `${plural(other.length, "bewaarde back-up is", "bewaarde back-ups zijn")} met een andere sleutel gemaakt (${[...new Set(other.map((r) => r.keyId))].join(", ")}). Die zijn alleen met de oude sleutel terug te zetten.`,
          }
        : { key: "key", label: "Sleutel", status: "ok", detail: `Alle bewaarde back-ups horen bij de huidige sleutel (${input.currentKeyId}). Staat die ook in de wachtwoordkluis?` },
    );
  }

  // 6. Hoeveel herstelmomenten zijn er?
  if (kept.length) {
    const oldest = kept[kept.length - 1];
    items.push({
      key: "retention",
      label: "Bewaarde back-ups",
      status: "ok",
      detail: `${plural(kept.length, "back-up", "back-ups")} beschikbaar, de oudste van ${formatDay(oldest.startedAt)}.`,
    });
  }

  // 7. Bestanden (uploads)
  if (input.target === "blob") {
    items.push({
      key: "files",
      label: "Bestanden en externe kopie",
      status: "info",
      detail: "De back-ups staan in Vercel Blob en de geüploade bestanden worden niet apart gekopieerd. Voor een kopie buiten Vercel is een eigen opslag (S3/R2) nodig.",
    });
  } else if (input.mirrorsFiles && newest) {
    items.push(
      newest.filesPending
        ? { key: "files", label: "Bestanden", status: "warn", detail: `${plural(newest.filesPending, "bestand wacht", "bestanden wachten")} nog op een kopie; dat gaat de volgende nacht verder.` }
        : { key: "files", label: "Bestanden", status: "ok", detail: "Alle geüploade bestanden zijn gekopieerd." },
    );
  }

  // 8. Neon: de eerste verdedigingslinie (terugzetten naar een eerder moment) en de ruimte voor previews.
  const neon = input.neon;
  if (!neon.configured) {
    items.push({ key: "neon", label: "Neon-herstelpunten", status: "info", detail: "Niet gecontroleerd: NEON_API_KEY is niet ingesteld." });
  } else if (neon.error) {
    items.push({ key: "neon", label: "Neon-herstelpunten", status: "warn", detail: `Neon kon niet gecontroleerd worden: ${neon.error}` });
  } else {
    const hours = neon.historyHours ?? 0;
    items.push(
      neon.mainReady
        ? {
            key: "neon",
            label: "Neon-herstelpunten",
            status: hours > 0 ? "ok" : "warn",
            detail:
              hours > 0
                ? `De hoofddatabase is in orde en kan naar elk moment in de afgelopen ${plural(Math.round(hours), "uur", "uur")} teruggezet worden.`
                : "De hoofddatabase is in orde, maar Neon bewaart geen historie om naar terug te gaan.",
          }
        : { key: "neon", label: "Neon-herstelpunten", status: "fail", detail: "De hoofdbranch van de database is niet gevonden of niet beschikbaar." },
    );
    if (neon.branchCount != null) {
      const n = neon.branchCount;
      items.push(
        n >= NEON_BRANCH_LIMIT - 2
          ? { key: "neon-branches", label: "Ruimte voor previews", status: "warn", detail: `Er zijn ${n} databasekopieën, het gratis plan staat er ongeveer ${NEON_BRANCH_LIMIT} toe. Nieuwe previews kunnen vastlopen.` }
          : { key: "neon-branches", label: "Ruimte voor previews", status: "ok", detail: `${plural(n, "databasekopie", "databasekopieën")} in gebruik (inclusief de hoofddatabase), ruim onder de grens van ongeveer ${NEON_BRANCH_LIMIT}.` },
      );
    }
  }

  const status = items.some((i) => i.status === "fail") ? "fail" : items.some((i) => i.status === "warn") ? "warn" : "ok";
  return { at: now.toISOString(), status, items };
}

export const CHECK_STATUS_LABEL: Record<BackupCheckReport["status"], string> = {
  ok: "Alles in orde",
  warn: "Aandacht nodig",
  fail: "Actie nodig",
};
