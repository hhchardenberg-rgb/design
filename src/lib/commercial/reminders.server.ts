import { prisma } from "@/lib/prisma";
import { CLUB_TIME_ZONE } from "@/lib/timezone";
import { loadCommercialAccess } from "./authz.server";

export const NOTICE_THRESHOLDS = [7, 14, 30] as const;

export interface DigestTask { title: string; companyName: string | null; dueOn: string }
export interface DigestNotice { companyName: string; noticeOn: string; daysLeft: number }
export interface Digest { userId: string; email: string; name: string; tasks: DigestTask[]; notices: DigestNotice[] }
export type DigestSender = (digest: Digest) => Promise<void>;

/** Kalenderdag in de clubtijdzone als YYYY-MM-DD. */
export function clubDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** Kleinste drempel (7, 14 of 30 dagen) waarbinnen de opzegdatum valt; null als die nog verder weg is of al voorbij. */
export function noticeThreshold(daysLeft: number): number | null {
  if (daysLeft < 0) return null;
  return NOTICE_THRESHOLDS.find((t) => daysLeft <= t) ?? null;
}

interface Pending { kind: "TASK_DUE" | "NOTICE"; refId: string; userId: string; task?: DigestTask; notice?: DigestNotice }

/**
 * Verzamelt wat vandaag een herinnering verdient, per ontvanger:
 * - taken die aan iemand zijn toegewezen en vandaag vervallen of verlopen zijn (eenmalig per taak);
 * - opzegdata van lopende contracten binnen 30, 14 en 7 dagen, naar de eigenaar van het dossier.
 * Er staan nooit bedragen of dossierinhoud in; alleen titel, sponsornaam en datum.
 */
async function collect(now: Date): Promise<Pending[]> {
  const today = clubDay(now);
  const todayN = dayNumber(today);
  const pending: Pending[] = [];

  const tasks = await prisma.commercialTask.findMany({
    where: { status: "OPEN", assigneeId: { not: null }, dueAt: { not: null, lt: new Date(now.getTime() + 2 * 86_400_000) } },
    include: { company: { select: { name: true, archivedAt: true } } },
  });
  for (const t of tasks) {
    if (clubDay(t.dueAt!) > today) continue; // exacte vergelijking op clubdag; de query is ruim genomen
    pending.push({ kind: "TASK_DUE", refId: t.id, userId: t.assigneeId!, task: { title: t.title, companyName: t.company?.name ?? null, dueOn: clubDay(t.dueAt!) } });
  }

  const contracts = await prisma.commercialContract.findMany({
    where: { status: "ACTIVE", archivedAt: null, noticeUntil: { not: null }, company: { ownerId: { not: null }, archivedAt: null } },
    include: { company: { select: { name: true, ownerId: true } } },
  });
  for (const c of contracts) {
    const noticeOn = c.noticeUntil!.toISOString().slice(0, 10);
    const daysLeft = dayNumber(noticeOn) - todayN;
    const threshold = noticeThreshold(daysLeft);
    if (threshold == null) continue;
    pending.push({ kind: "NOTICE", refId: `${c.id}:${threshold}`, userId: c.company.ownerId!, notice: { companyName: c.company.name, noticeOn, daysLeft } });
  }
  return pending;
}

export interface RunResult { recipients: number; tasks: number; notices: number; failed: number }

/**
 * Verstuurt de herinneringen. Elke herinnering wordt eerst vastgelegd (uniek per ontvanger en onderwerp);
 * alleen wat nieuw is wordt verstuurd, zodat een herhaalde of gelijktijdige run niet dubbel mailt.
 * Mislukt het versturen, dan wordt de vastlegging teruggedraaid zodat de volgende run het opnieuw probeert.
 */
export async function runReminders(now: Date, send: DigestSender): Promise<RunResult> {
  const pending = await collect(now);
  const result: RunResult = { recipients: 0, tasks: 0, notices: 0, failed: 0 };
  const byUser = new Map<string, Pending[]>();
  for (const p of pending) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);

  for (const [userId, items] of byUser) {
    const [access, user] = await Promise.all([loadCommercialAccess(userId), prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } })]);
    if (!user?.email || !access.isMember) continue;
    const allowed = items.filter((i) => (i.kind === "TASK_DUE" ? access.can("tasks:read") : access.can("contracts:read") && access.can("companies:read")));
    if (allowed.length === 0) continue;

    const fresh: Pending[] = [];
    for (const i of allowed) {
      try {
        await prisma.commercialReminderLog.create({ data: { userId, kind: i.kind, refId: i.refId } });
        fresh.push(i);
      } catch {
        // al eerder verstuurd (unieke sleutel)
      }
    }
    if (fresh.length === 0) continue;

    const digest: Digest = {
      userId, email: user.email, name: user.name ?? user.email,
      tasks: fresh.filter((f) => f.task).map((f) => f.task!),
      notices: fresh.filter((f) => f.notice).map((f) => f.notice!),
    };
    try {
      await send(digest);
      result.recipients += 1;
      result.tasks += digest.tasks.length;
      result.notices += digest.notices.length;
    } catch {
      result.failed += 1;
      await prisma.commercialReminderLog.deleteMany({ where: { userId, OR: fresh.map((f) => ({ kind: f.kind, refId: f.refId })) } });
    }
  }
  return result;
}
