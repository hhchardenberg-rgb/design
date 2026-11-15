import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { sendTicketEmail } from "@/lib/mail";
import { formatDay } from "@/lib/date-format";
import { pickBanner, recordBannerSend } from "./banner.server";
import { ticketAudit } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { asLocale, templateKeyFor, textsFor } from "./i18n";
import { DEFAULT_TEMPLATES, fillTemplate, templateIssues } from "./delivery";
import { linkTokenFor } from "./token";

// Aflevering van tickets: mail, persoonlijke link, ticketpagina en PDF.

/** Basisadres voor ticketlinks: NEXTAUTH_URL (productie), anders het adres van deze preview, anders localhost. */
const APP_URL = () => {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : "http://localhost:3000";
};
export const ticketLink = (publicId: string, linkVersion: number) => `${APP_URL()}/t/${linkTokenFor(publicId, linkVersion)}`;
const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });

export async function loadTemplate(key: string) {
  const row = await prisma.ticketEmailTemplate.findUnique({ where: { key } });
  const d = DEFAULT_TEMPLATES[key];
  return { subject: row?.subject ?? d.subject, body: row?.body ?? d.body };
}

export async function listTemplates() {
  const rows = await prisma.ticketEmailTemplate.findMany();
  return Object.entries(DEFAULT_TEMPLATES).map(([key, d]) => {
    const r = rows.find((x) => x.key === key);
    return { key, name: d.name, subject: r?.subject ?? d.subject, body: r?.body ?? d.body, custom: !!r, updatedAt: r?.updatedAt ?? null };
  });
}

export async function saveTemplate(actor: TicketsActor, key: string, raw: { subject?: string; body?: string; reset?: boolean }) {
  need(actor, "templates:manage");
  if (!(key in DEFAULT_TEMPLATES)) throw new ApiError(404, "Template niet gevonden.");
  if (raw.reset) {
    await prisma.ticketEmailTemplate.deleteMany({ where: { key } });
  } else {
    const subject = String(raw.subject ?? "").trim().slice(0, 200);
    const body = String(raw.body ?? "").trim().slice(0, 5000);
    const issues = templateIssues(subject, body);
    if (issues.length) throw new ApiError(400, issues[0]);
    await prisma.ticketEmailTemplate.upsert({ where: { key }, create: { key, subject, body, updatedBy: actor.name }, update: { subject, body, updatedBy: actor.name } });
  }
  await ticketAudit({ action: "template.updated", actor: actorOf(actor), summary: `E-mailtemplate '${key}' ${raw.reset ? "teruggezet" : "gewijzigd"}` });
  return { ok: true };
}

async function ticketForDelivery(id: string) {
  const t = await prisma.ticket.findUnique({
    where: { id },
    include: { type: { select: { name: true } }, season: { select: { name: true } }, links: { select: { event: { select: { title: true, startsAt: true } } } } },
  });
  if (!t) throw new ApiError(404, "Ticket niet gevonden.");
  return t;
}

const describeValidity = (t: { validityMode: string; season: { name: string } | null; validUntil: Date | null; links: { event: { title: string; startsAt: Date } }[] }, locale: unknown = "nl") => {
  const tx = textsFor(locale);
  if (t.links.length === 1) return `${t.links[0].event.title} (${formatDay(t.links[0].event.startsAt)})`;
  if (t.links.length > 1) return tx.matches(t.links.length);
  if (t.season) return t.season.name;
  return t.validUntil ? `${tx.validUntil} ${formatDay(t.validUntil)}` : "HHC Hardenberg";
};

/** Eén ticket mailen. Alleen actieve tickets met een e-mailadres; elke poging komt in het verzendlog. */
export async function sendTicketMailTo(actor: TicketsActor, id: string) {
  need(actor, "tickets:resend");
  return deliverTicketMail(id, { id: actor.id, name: actor.name });
}

/** Zelfde als hierboven maar zonder ingelogde medewerker: voor acties van het systeem (actiecodes, ticket opnieuw opvragen). */
export async function deliverTicketMail(id: string, by: { id: string | null; name: string }) {
  const t = await ticketForDelivery(id);
  if (t.anonymizedAt) throw new ApiError(400, "Dit ticket is geanonimiseerd.");
  if (t.status !== "ACTIVE") throw new ApiError(400, "Alleen actieve tickets worden verstuurd.");
  if (!t.email) throw new ApiError(400, "Dit ticket heeft geen e-mailadres.");
  const locale = asLocale(t.locale);
  const tpl = await loadTemplate(templateKeyFor("ticket", locale));
  const link = ticketLink(t.publicId, t.linkVersion);
  const vars = { voornaam: t.firstName, achternaam: t.lastName, type: t.type.name, wedstrijd: describeValidity(t, locale), link, datum: "", oudedatum: "", bericht: "" };
  // Een lopende sponsorbanner onder de mail; een storing hierin houdt het ticket nooit tegen.
  const picked = await pickBanner().catch(() => null);
  const banner = picked ? { title: picked.title, text: picked.text, buttonLabel: picked.buttonLabel, url: `${APP_URL()}/b/${picked.id}?t=${linkTokenFor(t.publicId, t.linkVersion)}` } : undefined;
  try {
    await sendTicketEmail({ to: t.email, subject: fillTemplate(tpl.subject, vars), bodyText: fillTemplate(tpl.body, vars), linkUrl: link, buttonLabel: textsFor(locale).viewTicket, banner });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    await prisma.ticketDelivery.create({ data: { ticketId: id, channel: "EMAIL", status: "FAILED", error: message.slice(0, 300), byId: by.id, byName: by.name } });
    throw new ApiError(502, `Versturen mislukt: ${message}`);
  }
  await prisma.ticketDelivery.create({ data: { ticketId: id, channel: "EMAIL", status: "SENT", kind: "TICKET", byId: by.id, byName: by.name } });
  if (picked) await recordBannerSend(picked.id, id).catch(() => {});
  await ticketAudit({ action: "ticket.mailed", actor: by, ticketId: id });
  return { ok: true };
}

/** Tickets van een wedstrijd (actief, met e-mailadres) die nog geen verzonden mail hebben; voor het opnieuw versturen. */
async function unsentIdsForEvent(eventId: string) {
  const tickets = await prisma.ticket.findMany({ where: { status: "ACTIVE", anonymizedAt: null, email: { not: null }, links: { some: { eventId } } }, select: { id: true } });
  const sent = new Set((await prisma.ticketDelivery.findMany({ where: { ticketId: { in: tickets.map((t) => t.id) }, channel: "EMAIL", status: "SENT", kind: "TICKET" }, select: { ticketId: true } })).map((d) => d.ticketId));
  return { all: tickets.length, ids: tickets.map((t) => t.id).filter((id) => !sent.has(id)) };
}

/** Hoeveel tickets van deze wedstrijd hebben nog geen mail gehad? */
export async function unsentMailCount(actor: TicketsActor, eventId: string) {
  need(actor, "tickets:resend");
  const r = await unsentIdsForEvent(eventId);
  return { total: r.all, unsent: r.ids.length };
}

/** Meerdere tickets mailen (max. 150 per aanroep); een fout bij één ticket stopt de rest niet. */
export async function sendTicketMails(actor: TicketsActor, raw: { ticketIds?: string[]; batchId?: string; eventId?: string }) {
  need(actor, "tickets:resend");
  let ids = raw.ticketIds ?? [];
  if (raw.batchId) ids = (await prisma.ticket.findMany({ where: { batchId: raw.batchId, status: "ACTIVE", email: { not: null } }, select: { id: true }, orderBy: { createdAt: "asc" } })).map((t) => t.id);
  // Per wedstrijd: alleen wie nog geen mail kreeg, zodat opnieuw proberen niemand dubbel mailt.
  if (raw.eventId) ids = (await unsentIdsForEvent(raw.eventId)).ids;
  if (ids.length === 0) throw new ApiError(400, "Geen tickets om te versturen.");
  // Al verstuurde tickets in deze batch overslaan, zodat opnieuw proberen veilig is.
  const already = raw.batchId ? new Set((await prisma.ticketDelivery.findMany({ where: { ticketId: { in: ids }, channel: "EMAIL", status: "SENT", kind: "TICKET" }, select: { ticketId: true } })).map((d) => d.ticketId)) : new Set<string>();
  const todo = ids.filter((i) => !already.has(i)).slice(0, 150);
  let sent = 0;
  const failed: string[] = [];
  for (const id of todo) {
    try {
      await sendTicketMailTo(actor, id);
      sent++;
    } catch {
      failed.push(id);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { sent, failed: failed.length, remaining: Math.max(0, ids.length - already.size - todo.length), skipped: already.size };
}

/** De persoonlijke link voor handmatig delen (kopiëren of WhatsApp); wordt gelogd. */
export async function shareLink(actor: TicketsActor, id: string, channel: "LINK_COPY" | "WHATSAPP") {
  need(actor, "tickets:resend");
  const t = await ticketForDelivery(id);
  if (t.anonymizedAt || t.status !== "ACTIVE") throw new ApiError(400, "Van dit ticket kan geen link worden gedeeld.");
  await prisma.ticketDelivery.create({ data: { ticketId: id, channel, status: "SENT", byId: actor.id, byName: actor.name } });
  await ticketAudit({ action: "ticket.link_shared", actor: actorOf(actor), ticketId: id, meta: { channel } });
  return { url: ticketLink(t.publicId, t.linkVersion) };
}

export async function deliveriesFor(id: string) {
  return prisma.ticketDelivery.findMany({ where: { ticketId: id }, orderBy: { createdAt: "desc" }, take: 20 });
}

// De openbare ticketpagina en de A4-pdf staan in src/lib/tickets/design/ (ticketontwerp).
