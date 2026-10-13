import { prisma } from "@/lib/prisma";
import { loadCommercialAccess } from "./authz.server";
import { clubDay, dayNumber } from "./club-day";
import { computeContactGaps } from "./contact-moments.server";
import { effectiveDigestFrequency, isDigestDay, nextDigestDay } from "./digest-frequency";
import { loadDefaultDigestFrequency, mutedCompanyIds } from "./reminder-settings.server";

export { clubDay };

export const NOTICE_THRESHOLDS = [7, 14, 30] as const;
/** Zo ver vooruit worden taken verzameld, zodat een wekelijkse of maandelijkse mail ook wat eraan komt meeneemt. */
const TASK_LOOKAHEAD_DAYS = 40;

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

interface Pending { kind: "TASK_DUE" | "NOTICE" | "CONTACT"; refId: string; userId: string; companyId?: string; task?: DigestTask; notice?: DigestNotice; contact?: DigestContact }

/**
 * Verzamelt wat vandaag een herinnering verdient, per ontvanger:
 * - taken die aan iemand zijn toegewezen en verlopen zijn of vervallen vóór de volgende verzenddag van die persoon (eenmalig per taak);
 * - opzegdata van lopende contracten binnen 30, 14 en 7 dagen, naar de eigenaar van het dossier;
 * - sponsoren waarmee te lang geen contactmoment was (termijn per sponsorvorm, door beheerders), naar de eigenaar van het dossier;
 *   wie een sponsor zelf op stil zette, krijgt over die sponsor geen opzeg- en contactherinneringen;
 *   bij aanhoudende stilte komt er na elke 30 dagen opnieuw een herinnering.
 * Er staan nooit bedragen of dossierinhoud in; alleen titel, sponsornaam en datum.
 */
async function collect(now: Date): Promise<Pending[]> {
  const today = clubDay(now);
  const todayN = dayNumber(today);
  const pending: Pending[] = [];

  const tasks = await prisma.commercialTask.findMany({
    where: { status: "OPEN", assigneeId: { not: null }, dueAt: { not: null, lt: new Date(now.getTime() + (TASK_LOOKAHEAD_DAYS + 1) * 86_400_000) } },
    include: { company: { select: { name: true, archivedAt: true } } },
  });
  for (const t of tasks) {
    // Ook taken die vóór de volgende verzenddag vervallen; per ontvanger wordt dat verderop gefilterd.
    if (dayNumber(clubDay(t.dueAt!)) - todayN > TASK_LOOKAHEAD_DAYS) continue;
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
    pending.push({ kind: "NOTICE", refId: `${c.id}:${threshold}`, userId: c.company.ownerId!, companyId: c.companyId, notice: { companyName: c.company.name, noticeOn, daysLeft } });
  }

  for (const g of await computeContactGaps(now)) {
    if (!g.ownerId) continue;
    pending.push({
      kind: "CONTACT",
      refId: `${g.companyId}:${g.lastContactOn ?? "nooit"}:${Math.floor(g.overdueDays / 30)}`,
      userId: g.ownerId,
      companyId: g.companyId,
      contact: { companyName: g.companyName, lastContactOn: g.lastContactOn, daysSince: g.daysSince, intervalDays: g.intervalDays },
    });
  }
  return pending;
}

export interface RunResult { recipients: number; tasks: number; notices: number; contacts: number; failed: number; postponed: number }

/**
 * Verstuurt de herinneringen. Elke herinnering wordt eerst vastgelegd (uniek per ontvanger en onderwerp);
 * alleen wat nieuw is wordt verstuurd, zodat een herhaalde of gelijktijdige run niet dubbel mailt.
 * Mislukt het versturen, dan wordt de vastlegging teruggedraaid zodat de volgende run het opnieuw probeert.
 * Is het voor iemand geen verzenddag (eigen frequentie of de standaard), dan wordt niets vastgelegd:
 * wat dan nog speelt, komt in de eerstvolgende mail.
 */
export async function runReminders(now: Date, send: DigestSender): Promise<RunResult> {
  const pending = await collect(now);
  const today = clubDay(now);
  const fallback = await loadDefaultDigestFrequency();
  const result: RunResult = { recipients: 0, tasks: 0, notices: 0, contacts: 0, failed: 0, postponed: 0 };
  const byUser = new Map<string, Pending[]>();
  for (const p of pending) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);

  for (const [userId, items] of byUser) {
    const [access, user] = await Promise.all([loadCommercialAccess(userId), prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, notifyCommercialDigest: true, commercialDigestFrequency: true } })]);
    if (!user?.email || !access.isMember) continue;
    const frequency = effectiveDigestFrequency(user, fallback);
    if (frequency === "OFF") continue; // zelf uitgezet in het profiel, of standaard uit
    if (!isDigestDay(frequency, today)) { result.postponed += 1; continue; }
    const next = nextDigestDay(frequency, today) ?? today;
    const muted = await mutedCompanyIds(userId);
    const allowed = items.filter((i) => {
      if (i.companyId && muted.has(i.companyId)) return false; // sponsor zelf op stil gezet
      if (i.kind === "TASK_DUE") return access.can("tasks:read") && i.task!.dueOn < next;
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
