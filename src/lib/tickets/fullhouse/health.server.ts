import { prisma } from "@/lib/prisma";
import { ticketProvider } from "./index";

// Gezondheid van de Fullhouse-synchronisatie: wanneer ging het laatst goed, draait de frequente
// synchronisatie, komen er webhooks binnen en is er een storing. Gebruikt door het dashboard en de Fullhouse-pagina.

/** Hoe vaak de geplande synchronisatie (GitHub Actions, zie .github/workflows/fullhouse-sync.yml) draait. */
export const SCHEDULE_MINUTES = 5;

/** Namen in de synchronisatielijst voor automatische rondes. */
export const AUTO_NAMES = {
  cron: "Dagelijkse ronde",
  schedule: "Automatisch (gepland)",
  page: "Automatisch (bij openen)",
  ticket: "Automatisch",
} as const;

/** Automatische ticketsynchronisaties zonder wijzigingen: nuttig voor de volgende ronde, maar ruis in de lijst. */
export const QUIET_RUN = { kind: "tickets", status: "OK", fetched: 0, startedBy: AUTO_NAMES.ticket };

export type SyncHealthState = "test" | "ok" | "warning" | "late" | "failing";

export interface SyncHealth {
  state: SyncHealthState;
  message: string;
  lastOkAt: Date | null;
  lastAutoAt: Date | null;
  lastError: string | null;
  lastWebhookAt: Date | null;
  /** Draait de frequente (geplande) synchronisatie de afgelopen 7 dagen? */
  frequent: boolean;
  /** Na hoeveel minuten zonder geslaagde synchronisatie het dashboard waarschuwt. */
  lateAfterMinutes: number;
  /** Moment van deze meting, voor "x min geleden" in de weergave. */
  checkedAt: Date;
}

export async function syncHealth(now = new Date(), opts: { allowMock?: boolean } = {}): Promise<SyncHealth> {
  const mode = opts.allowMock ? "sandbox" : ticketProvider().mode;
  const [lastOk, autos, scheduled, webhook] = await Promise.all([
    prisma.ticketSyncRun.findFirst({ where: { status: "OK", kind: { in: ["tickets", "auto"] } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
    prisma.ticketSyncRun.findMany({ where: { kind: "auto", status: { not: "RUNNING" } }, orderBy: { startedAt: "desc" }, take: 2, select: { status: true, error: true, startedAt: true } }),
    prisma.ticketSyncRun.findFirst({ where: { kind: "auto", startedBy: AUTO_NAMES.schedule, startedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, select: { id: true } }),
    prisma.ticketSyncRun.findFirst({ where: { kind: { startsWith: "webhook:" } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
  ]);
  const frequent = !!scheduled;
  const lateAfterMinutes = frequent ? SCHEDULE_MINUTES * 3 + 5 : 26 * 60;
  const base = { lastOkAt: lastOk?.finishedAt ?? null, lastAutoAt: autos[0]?.startedAt ?? null, lastError: autos[0]?.status === "FAILED" ? autos[0].error : null, lastWebhookAt: webhook?.startedAt ?? null, frequent, lateAfterMinutes, checkedAt: now };
  if (mode === "mock") return { ...base, state: "test", message: "Testmodus: er is geen echte koppeling met Fullhouse, dus er wordt niet automatisch gesynchroniseerd." };
  const ageMin = base.lastOkAt ? (now.getTime() - base.lastOkAt.getTime()) / 60_000 : Infinity;
  if (autos.length === 2 && autos.every((a) => a.status === "FAILED")) return { ...base, state: "failing", message: "Storing: de automatische synchronisatie met Fullhouse mislukt herhaaldelijk. Nieuwe aankopen worden bij het scannen nog wel live bij Fullhouse opgezocht." };
  if (ageMin > lateAfterMinutes) return { ...base, state: "late", message: base.lastOkAt ? "De synchronisatie met Fullhouse loopt achter: de laatste geslaagde ronde is te lang geleden." : "Er is nog geen geslaagde synchronisatie met Fullhouse." };
  if (base.lastError) return { ...base, state: "warning", message: "De laatste automatische ronde ging deels mis; de volgende ronde probeert het opnieuw." };
  return { ...base, state: "ok", message: frequent ? `Fullhouse wordt elke ${SCHEDULE_MINUTES} minuten automatisch gesynchroniseerd.` : "Fullhouse wordt automatisch gesynchroniseerd (dagelijks en bij het openen van het dashboard)." };
}
