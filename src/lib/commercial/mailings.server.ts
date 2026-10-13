import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { auditRecord, need, type RecordCtx } from "./ctx.server";
import { companyScopeWhere } from "./scope";
import { normalizeEmail } from "./mail-security";

export const MAX_RECIPIENTS = 500;
const COMPANY_STATUSES = ["PROSPECT", "ACTIVE", "FORMER"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MailingInput { subject: string; bodyText: string; audienceStatus?: string | null }
export interface OutgoingMail { to: string; name: string | null; subject: string; bodyText: string }
export type MailSender = (mail: OutgoingMail) => Promise<{ providerMessageId: string | null }>;

function clean(input: MailingInput) {
  const subject = input.subject.trim();
  const bodyText = input.bodyText.trim();
  if (!subject || subject.length > 200) throw new ApiError(400, "Geef een onderwerp op (maximaal 200 tekens).");
  if (!bodyText || bodyText.length > 20_000) throw new ApiError(400, "Schrijf een bericht (maximaal 20.000 tekens).");
  if (input.audienceStatus && !COMPANY_STATUSES.includes(input.audienceStatus)) throw new ApiError(400, "Onbekende dossierstatus.");
  return { subject, bodyText, audienceStatus: input.audienceStatus || null };
}

/** Ontvangers worden alleen getoond (en geteld) voor dossiers binnen het eigen bereik. */
async function visibleCompanyIds(ctx: RecordCtx): Promise<string[]> {
  const rows = await prisma.commercialCompany.findMany({ where: companyScopeWhere(ctx.scope("companies"), ctx.viewer), select: { id: true } });
  return rows.map((r) => r.id);
}

async function loadMailing(id: string) {
  const m = await prisma.commercialMailing.findUnique({ where: { id } });
  if (!m || m.archivedAt) throw new ApiError(404, "Mailing niet gevonden.");
  return m;
}

export async function listMailings(ctx: RecordCtx) {
  need(ctx, "mailings:read");
  const rows = await prisma.commercialMailing.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });
  const visible = await visibleCompanyIds(ctx);
  return Promise.all(rows.map(async (m) => {
    const groups = await prisma.commercialMailingRecipient.groupBy({ by: ["status"], where: { mailingId: m.id, companyId: { in: visible } }, _count: true });
    return { id: m.id, subject: m.subject, status: m.status, audienceStatus: m.audienceStatus, sentAt: m.sentAt, createdAt: m.createdAt, counts: Object.fromEntries(groups.map((g) => [g.status, g._count])) };
  }));
}

export async function getMailing(ctx: RecordCtx, id: string) {
  need(ctx, "mailings:read");
  const m = await loadMailing(id);
  const recipients = await prisma.commercialMailingRecipient.findMany({
    where: { mailingId: id, companyId: { in: await visibleCompanyIds(ctx) } },
    orderBy: { email: "asc" },
    select: { id: true, companyId: true, email: true, name: true, status: true, error: true, sentAt: true, deliveredAt: true, openedAt: true },
  });
  return { id: m.id, subject: m.subject, bodyText: m.bodyText, audienceStatus: m.audienceStatus, status: m.status, version: m.version, sentAt: m.sentAt, recipients };
}

export async function createMailing(ctx: RecordCtx, input: MailingInput) {
  need(ctx, "mailings:create");
  const m = await prisma.commercialMailing.create({ data: { ...clean(input), createdById: ctx.userId } });
  await auditRecord(ctx, { action: "mailing.create", entity: "mailing", entityId: m.id });
  return m.id;
}

export async function updateMailing(ctx: RecordCtx, id: string, input: MailingInput & { version: number }) {
  need(ctx, "mailings:update");
  const data = clean(input);
  const r = await prisma.commercialMailing.updateMany({ where: { id, version: input.version, status: "DRAFT", archivedAt: null }, data: { ...data, version: { increment: 1 } } });
  if (r.count === 0) {
    const m = await loadMailing(id);
    throw new ApiError(409, m.status !== "DRAFT" ? "Een verstuurde mailing kan niet meer worden gewijzigd." : "De mailing is intussen gewijzigd. Laad de pagina opnieuw.");
  }
  // Een gewijzigde tekst of doelgroep vraagt om opnieuw voorbereiden.
  await prisma.commercialMailingRecipient.deleteMany({ where: { mailingId: id } });
}

/** Legt de ontvangers vast: contacten met een geldig adres binnen jouw bereik, zonder afgemelde adressen en dubbelen. */
export async function prepareRecipients(ctx: RecordCtx, id: string) {
  need(ctx, "mailings:update");
  need(ctx, "contacts:read");
  const m = await loadMailing(id);
  if (m.status !== "DRAFT") throw new ApiError(409, "Alleen een concept kan worden voorbereid.");
  const contacts = await prisma.commercialContact.findMany({
    where: {
      archivedAt: null,
      email: { not: null },
      company: { ...companyScopeWhere(ctx.scope("companies"), ctx.viewer), archivedAt: null, ...(m.audienceStatus ? { status: m.audienceStatus } : {}) },
    },
    select: { id: true, companyId: true, email: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  const unsub = new Set((await prisma.commercialUnsubscribe.findMany({ select: { email: true } })).map((u) => u.email));
  const seen = new Set<string>();
  const rows: { mailingId: string; companyId: string; contactId: string; email: string; name: string }[] = [];
  let invalid = 0, unsubscribed = 0, duplicates = 0;
  for (const c of contacts) {
    const email = normalizeEmail(c.email!);
    if (!EMAIL.test(email)) { invalid++; continue; }
    if (unsub.has(email)) { unsubscribed++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    rows.push({ mailingId: id, companyId: c.companyId, contactId: c.id, email, name: c.name });
  }
  if (rows.length > MAX_RECIPIENTS) throw new ApiError(400, `Een mailing mag maximaal ${MAX_RECIPIENTS} ontvangers hebben; je doelgroep telt er ${rows.length}. Verklein de doelgroep.`);
  await prisma.$transaction([
    prisma.commercialMailingRecipient.deleteMany({ where: { mailingId: id } }),
    prisma.commercialMailingRecipient.createMany({ data: rows }),
  ]);
  await auditRecord(ctx, { action: "mailing.prepare", entity: "mailing", entityId: id, after: { recipients: rows.length, invalid, unsubscribed, duplicates } });
  return { recipients: rows.length, skipped: { invalid, unsubscribed, duplicates } };
}

/**
 * Verstuurt naar alle nog niet verstuurde ontvangers. De mailing wordt eerst op 'verzenden' gezet
 * (één winnaar bij gelijktijdig klikken); het afmeldregister wordt vlak voor elke verzending opnieuw
 * gecontroleerd. Een mislukte verzending stopt de rest niet. Opnieuw aanroepen probeert alleen de
 * nog openstaande ontvangers, dus niemand krijgt dezelfde mailing tweemaal.
 */
export async function sendMailing(ctx: RecordCtx, id: string, send: MailSender) {
  need(ctx, "mailings:send");
  const m = await loadMailing(id);
  if (m.status === "SENT") throw new ApiError(409, "Deze mailing is al verstuurd.");
  const pendingCount = await prisma.commercialMailingRecipient.count({ where: { mailingId: id, status: "PENDING" } });
  if (pendingCount === 0) throw new ApiError(409, "Er zijn geen ontvangers. Bereid de mailing eerst voor.");
  if (m.status === "DRAFT") {
    const claimed = await prisma.commercialMailing.updateMany({ where: { id, status: "DRAFT", version: m.version }, data: { status: "SENDING", sentById: ctx.userId, version: { increment: 1 } } });
    if (claimed.count === 0) throw new ApiError(409, "De mailing wordt al verstuurd of is gewijzigd.");
  }
  const recipients = await prisma.commercialMailingRecipient.findMany({ where: { mailingId: id, status: "PENDING" }, orderBy: { email: "asc" } });
  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const r of recipients) {
    // Alleen verwerken wat nog openstaat (parallelle run).
    const claim = await prisma.commercialMailingRecipient.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "SENDING" } });
    if (claim.count === 0) continue;
    if (await prisma.commercialUnsubscribe.findUnique({ where: { email: r.email } })) {
      await prisma.commercialMailingRecipient.update({ where: { id: r.id }, data: { status: "SKIPPED", error: "Afgemeld" } });
      result.skipped++;
      continue;
    }
    try {
      const out = await send({ to: r.email, name: r.name, subject: m.subject, bodyText: m.bodyText });
      await prisma.commercialMailingRecipient.update({ where: { id: r.id }, data: { status: "SENT", providerMessageId: out.providerMessageId, sentAt: new Date() } });
      result.sent++;
    } catch (e) {
      await prisma.commercialMailingRecipient.update({ where: { id: r.id }, data: { status: "FAILED", error: (e instanceof Error ? e.message : "Onbekende fout").slice(0, 300) } });
      result.failed++;
    }
  }
  const open = await prisma.commercialMailingRecipient.count({ where: { mailingId: id, status: { in: ["PENDING", "SENDING"] } } });
  if (open === 0) await prisma.commercialMailing.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  await auditRecord(ctx, { action: "mailing.send", entity: "mailing", entityId: id, after: result });
  return result;
}

export const MAX_TEST_MAILS_PER_HOUR = 10;

/**
 * Testmail van een (nog niet opgeslagen) bericht naar één zelfgekozen adres. Gaat niet naar ontvangers,
 * raakt geen mailing en kijkt niet in het afmeldregister (je mailt jezelf of een collega). Beperkt per
 * gebruiker per uur, zodat het geen manier wordt om willekeurige mail vanaf het verenigingsadres te sturen.
 */
export async function sendTestMail(ctx: RecordCtx, input: { to: string; subject: string; bodyText: string; name?: string | null }, send: MailSender) {
  need(ctx, "mailings:send");
  const to = normalizeEmail(input.to ?? "");
  if (!to || !EMAIL.test(to) || to.length > 254) throw new ApiError(400, "Geef een geldig e-mailadres op.");
  const { subject, bodyText } = clean({ subject: input.subject, bodyText: input.bodyText });
  const recent = await prisma.commercialAuditEvent.count({ where: { actorId: ctx.userId, action: "mailing.test", createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= MAX_TEST_MAILS_PER_HOUR) throw new ApiError(429, `Je hebt het maximum van ${MAX_TEST_MAILS_PER_HOUR} testmails per uur bereikt. Probeer het later opnieuw.`);
  // Het eerst vastleggen telt ook bij een mislukte verzending mee.
  await auditRecord(ctx, { action: "mailing.test", entity: "mailing", entityId: "test" });
  try {
    await send({ to, name: input.name?.trim() || null, subject: `[TESTMAIL] ${subject}`, bodyText: `Dit is een testmail. Hij is niet naar sponsoren gestuurd.\n\n${bodyText}` });
  } catch (e) {
    throw new ApiError(502, `De testmail kon niet worden verstuurd: ${e instanceof Error ? e.message : "onbekende fout"}`);
  }
  return { sentTo: to };
}

/** Zet een mislukte ontvanger terug op 'open' zodat een nieuwe verzendronde het opnieuw probeert. */
export async function retryFailed(ctx: RecordCtx, id: string) {
  need(ctx, "mailings:send");
  await loadMailing(id);
  const r = await prisma.commercialMailingRecipient.updateMany({ where: { mailingId: id, status: "FAILED" }, data: { status: "PENDING", error: null } });
  await prisma.commercialMailing.updateMany({ where: { id, status: "SENT" }, data: { status: "SENDING" } });
  return { requeued: r.count };
}

export async function archiveMailing(ctx: RecordCtx, id: string) {
  need(ctx, "mailings:archive");
  const m = await loadMailing(id);
  if (m.status === "SENDING") throw new ApiError(409, "Een mailing die wordt verstuurd kan niet worden gearchiveerd.");
  await prisma.commercialMailing.update({ where: { id }, data: { archivedAt: new Date() } });
  await auditRecord(ctx, { action: "mailing.archive", entity: "mailing", entityId: id });
}

export async function recordUnsubscribe(email: string, source: "LINK" | "BOUNCE" | "COMPLAINT" | "MANUAL") {
  const e = normalizeEmail(email);
  await prisma.commercialUnsubscribe.upsert({ where: { email: e }, create: { email: e, source }, update: {} });
}

const RECIPIENT_STATUS_FOR_EVENT: Record<string, "DELIVERED" | "BOUNCED" | "COMPLAINED" | undefined> = {
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
};

/**
 * Verwerkt een webhook-gebeurtenis van de mailprovider, idempotent op het gebeurtenis-id.
 * Harde bounces en klachten melden het adres automatisch af.
 */
export async function applyMailEvent(eventId: string, event: { type: string; data?: { email_id?: string; to?: string[]; bounce?: { type?: string } } }) {
  try {
    await prisma.commercialMailEvent.create({ data: { id: eventId, type: event.type.slice(0, 100) } });
  } catch {
    return { duplicate: true };
  }
  const providerId = event.data?.email_id;
  if (!providerId) return { duplicate: false, matched: 0 };
  const where = { providerMessageId: providerId };
  let matched = 0;
  const next = RECIPIENT_STATUS_FOR_EVENT[event.type];
  if (next) {
    // Een latere gebeurtenis (bv. bounce) wint van 'afgeleverd'; een vertraagde 'delivered' overschrijft een bounce niet.
    const guard = next === "DELIVERED" ? { status: { in: ["SENT"] } } : {};
    const r = await prisma.commercialMailingRecipient.updateMany({ where: { ...where, ...guard }, data: { status: next, ...(next === "DELIVERED" ? { deliveredAt: new Date() } : {}) } });
    matched = r.count;
  } else if (event.type === "email.opened") {
    matched = (await prisma.commercialMailingRecipient.updateMany({ where: { ...where, openedAt: null }, data: { openedAt: new Date() } })).count;
  }
  const hardBounce = event.type === "email.bounced" && (event.data?.bounce?.type ?? "Permanent").toLowerCase() === "permanent";
  if (hardBounce || event.type === "email.complained") {
    const rows = await prisma.commercialMailingRecipient.findMany({ where, select: { email: true } });
    for (const r of rows) await recordUnsubscribe(r.email, event.type === "email.complained" ? "COMPLAINT" : "BOUNCE");
  }
  return { duplicate: false, matched };
}
