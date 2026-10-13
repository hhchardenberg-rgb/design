import { prisma } from "@/lib/prisma";
import { loadCommercialAccess } from "./authz.server";
import { clubDay, dayNumber } from "./club-day";
import { computeContactGaps } from "./contact-moments.server";

export { clubDay };

export const NOTICE_THRESHOLDS = [7, 14, 30] as const;

export interface DigestTask { title: string; companyName: string | null; dueOn: string }
export interface DigestNotice { companyName: string; noticeOn: string; daysLeft: number }
export interface DigestContact { companyName: string; lastContactOn: string | null; daysSince: number; intervalDays: number }
export interface Digest { userId: string; email: string; name: string; tasks: DigestTask[]; notices: DigestNotice[]; contacts: DigestContact[] }
export type DigestSender = (digest: Digest) => Promise<void>;


/** Kleinste drempel (7, 14 of 30 dagen) waarbinnen de opzegdatum valt; null als die nog verder weg is of al voorbij. */
export function noticeThreshold(daysLeft: number): number | null {
  if (daysLeft < 0) return null;
  return NOTICE_THRESHOLDS.find((t) => daysLeft <= t) ?? null;
}

interface Pending { kind: "TASK_DUE" | "NOTICE" | "CONTACT"; refId: string; userId: string; task?: DigestTask; notice?: DigestNotice; contact?: DigestContact }

/**
 * Verzamelt wat vandaag een herinnering verdient, per ontvanger:
 * - taken die aan iemand zijn toegewezen en vandaag vervallen of verlopen zijn (eenmalig per taak);
 * - opzegdata van lopende contracten binnen 30, 14 en 7 dagen, naar de eigenaar van het dossier;
 * - sponsoren waarmee te lang geen contactmoment was (per sponsorvorm instelbaar), naar de eigenaar van het dossier;
 *   bij aanhoudende stilte komt er na elke 30 dagen opnieuw een herinnering.
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

  for (const g of await computeContactGaps(now)) {
    if (!g.ownerId) continue;
    pending.push({
      kind: "CONTACT",
      refId: `${g.companyId}:${g.lastContactOn ?? "nooit"}:${Math.floor(g.overdueDays / 30)}`,
      userId: g.ownerId,
      contact: { companyName: g.companyName, lastContactOn: g.lastContactOn, daysSince: g.daysSince, intervalDays: g.intervalDays },
    });
  }
  return pending;
}

export interface RunResult { recipients: number; tasks: number; notices: number; contacts: number; failed: number }

/**
 * Verstuurt de herinneringen. Elke herinnering wordt eerst vastgelegd (uniek per ontvanger en onderwerp);
 * alleen wat nieuw is wordt verstuurd, zodat een herhaalde of gelijktijdige run niet dubbel mailt.
 * Mislukt het versturen, dan wordt de vastlegging teruggedraaid zodat de volgende run het opnieuw probeert.
 */
export async function runReminders(now: Date, send: DigestSender): Promise<RunResult> {
  const pending = await collect(now);
  const result: RunResult = { recipients: 0, tasks: 0, notices: 0, contacts: 0, failed: 0 };
  const byUser = new Map<string, Pending[]>();
  for (const p of pending) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);

  for (const [userId, items] of byUser) {
    const [access, user] = await Promise.all([loadCommercialAccess(userId), prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, notifyCommercialDigest: true } })]);
    if (!user?.email || !access.isMember) continue;
    if (!user.notifyCommercialDigest) continue; // zelf uitgezet in het profiel
    const allowed = items.filter((i) => {
      if (i.kind === "TASK_DUE") return access.can("tasks:read");
      if (i.kind === "CONTACT") return access.can("companies:read") && access.can("history:read");
      return access.can("contracts:read") && access.can("companies:read");
    });
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
      contacts: fresh.filter((f) => f.contact).map((f) => f.contact!),
    };
    try {
      await send(digest);
      result.recipients += 1;
      result.tasks += digest.tasks.length;
      result.notices += digest.notices.length;
      result.contacts += digest.contacts.length;
    } catch {
      result.failed += 1;
      await prisma.commercialReminderLog.deleteMany({ where: { userId, OR: fresh.map((f) => ({ kind: f.kind, refId: f.refId })) } });
    }
  }
  return result;
}
