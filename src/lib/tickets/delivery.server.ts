import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { sendTicketEmail } from "@/lib/mail";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { ticketAudit } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { DEFAULT_TEMPLATES, fillTemplate, pdfSafe, templateIssues } from "./delivery";
import { displayStatus, TICKET_STATUS_LABELS, type TicketStatus } from "./rules";
import { HHC_LOGO_PNG_BASE64 } from "./pdf-logo";
import { linkTokenFor, parseLinkToken, qrCodeFor } from "./token";

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

const describeValidity = (t: { validityMode: string; season: { name: string } | null; validUntil: Date | null; links: { event: { title: string; startsAt: Date } }[] }) => {
  if (t.links.length === 1) return `${t.links[0].event.title} (${formatDay(t.links[0].event.startsAt)})`;
  if (t.links.length > 1) return `${t.links.length} wedstrijden`;
  if (t.season) return t.season.name;
  return t.validUntil ? `t/m ${formatDay(t.validUntil)}` : "HHC Hardenberg";
};

/** Eén ticket mailen. Alleen actieve tickets met een e-mailadres; elke poging komt in het verzendlog. */
export async function sendTicketMailTo(actor: TicketsActor, id: string) {
  need(actor, "tickets:resend");
  const t = await ticketForDelivery(id);
  if (t.anonymizedAt) throw new ApiError(400, "Dit ticket is geanonimiseerd.");
  if (t.status !== "ACTIVE") throw new ApiError(400, "Alleen actieve tickets worden verstuurd.");
  if (!t.email) throw new ApiError(400, "Dit ticket heeft geen e-mailadres.");
  const tpl = await loadTemplate("ticket");
  const link = ticketLink(t.publicId, t.linkVersion);
  const vars = { voornaam: t.firstName, achternaam: t.lastName, type: t.type.name, wedstrijd: describeValidity(t), link };
  try {
    await sendTicketEmail({ to: t.email, subject: fillTemplate(tpl.subject, vars), bodyText: fillTemplate(tpl.body, vars), linkUrl: link });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    await prisma.ticketDelivery.create({ data: { ticketId: id, channel: "EMAIL", status: "FAILED", error: message.slice(0, 300), byId: actor.id, byName: actor.name } });
    throw new ApiError(502, `Versturen mislukt: ${message}`);
  }
  await prisma.ticketDelivery.create({ data: { ticketId: id, channel: "EMAIL", status: "SENT", kind: "TICKET", byId: actor.id, byName: actor.name } });
  await ticketAudit({ action: "ticket.mailed", actor: actorOf(actor), ticketId: id });
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

// ── Openbare ticketpagina en PDF (geen login; toegang = geldige, ondertekende link) ──

export interface PublicTicket {
  name: string;
  typeName: string;
  validity: string;
  status: TicketStatus | "EXPIRED";
  statusLabel: string;
  usable: boolean;
  validUntil: Date | null;
  events: { title: string; startsAt: Date; location: string | null }[];
  qr: string;
  zone: string | null;
}

/** null = onbekende, vervalste of ingetrokken link. Bevat nooit e-mail of telefoon. */
export async function publicTicketByToken(token: string): Promise<PublicTicket | null> {
  const ref = parseLinkToken(token);
  if (!ref) return null;
  const t = await prisma.ticket.findUnique({
    where: { publicId: ref.publicId },
    include: { type: { select: { name: true } }, zone: { select: { name: true } }, season: { select: { name: true } }, links: { select: { event: { select: { title: true, startsAt: true, location: true } } } } },
  });
  if (!t || t.linkVersion !== ref.version || t.anonymizedAt) return null;
  const status = displayStatus({ status: t.status as TicketStatus, validUntil: t.validUntil }, new Date());
  const events = t.links.map((l) => l.event).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return {
    name: `${t.firstName} ${t.lastName}`.trim(),
    typeName: t.type.name,
    validity: describeValidity(t),
    status,
    statusLabel: TICKET_STATUS_LABELS[status],
    usable: status === "ACTIVE",
    validUntil: t.validUntil,
    events,
    qr: qrCodeFor(t.publicId, t.qrVersion),
    zone: t.zone?.name ?? null,
  };
}

export const qrSvg = (data: string) => QRCode.toString(data, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

/** Eén A4-pagina als toegangsbewijs: HHC-huisstijl, wedstrijdgegevens en een grote QR-code. Alleen voor actieve tickets. */
export async function ticketPdf(pt: PublicTicket): Promise<Uint8Array> {
  const W = 595.28;
  const H = 841.89;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const orange = rgb(0.949, 0.416, 0.129);
  const dark = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.4, 0.4, 0.4);
  const text = (t: string, x: number, y: number, size: number, f = font, color = dark, maxWidth?: number) => page.drawText(pdfSafe(t), { x, y, size, font: f, color, ...(maxWidth ? { maxWidth } : {}) });
  const centered = (t: string, y: number, size: number, f = font, color = dark) => {
    const safe = pdfSafe(t);
    page.drawText(safe, { x: Math.max(40, (W - f.widthOfTextAtSize(safe, size)) / 2), y, size, font: f, color });
  };

  // Kop in HHC-oranje met logo.
  page.drawRectangle({ x: 0, y: H - 130, width: W, height: 130, color: orange });
  const logo = await pdf.embedPng(Buffer.from(HHC_LOGO_PNG_BASE64, "base64"));
  page.drawRectangle({ x: 36, y: H - 112, width: 70, height: 94, color: rgb(1, 1, 1) });
  page.drawImage(logo, { x: 41, y: H - 107, width: 60, height: 84 });
  text("HHC Hardenberg", 126, H - 66, 30, bold, rgb(1, 1, 1));
  text("Toegangsbewijs", 126, H - 92, 16, font, rgb(1, 1, 1));

  // Wedstrijd: titel, datum en plaats (dd/mm/yyyy).
  const first = pt.events[0];
  const title = pt.events.length === 1 ? first.title : pt.events.length > 1 ? `${pt.events.length} wedstrijden` : pt.validity;
  let y = H - 190;
  text(title, 40, y, 24, bold, dark, W - 80);
  y -= 26;
  if (pt.events.length === 1) {
    text(formatDayTime(first.startsAt), 40, y, 15, font, grey);
    if (first.location) text(first.location, 40, y - 20, 13, font, grey);
  } else {
    text(pt.validity, 40, y, 14, font, grey);
  }

  // QR-code: groot, met stille rand, voor een snelle scan.
  const size = 300;
  const qx = (W - size) / 2;
  const qy = 255;
  const png = await QRCode.toBuffer(pt.qr, { type: "png", margin: 2, width: 900, errorCorrectionLevel: "M" });
  page.drawRectangle({ x: qx - 16, y: qy - 16, width: size + 32, height: size + 32, color: rgb(1, 1, 1), borderColor: orange, borderWidth: 3 });
  page.drawImage(await pdf.embedPng(png), { x: qx, y: qy, width: size, height: size });
  centered("Laat deze code scannen bij de ingang", qy - 38, 13, font, grey);

  // Houder en soort ticket.
  page.drawLine({ start: { x: 40, y: 190 }, end: { x: W - 40, y: 190 }, thickness: 1, color: rgb(0.85, 0.85, 0.85), dashArray: [4, 4] });
  text(pt.name, 40, 155, 22, bold, dark, W - 80);
  text(pt.typeName + (pt.zone ? ` - ${pt.zone}` : ""), 40, 131, 14, font, dark, W - 80);
  if (pt.events.length !== 1) text(pt.validity, 40, 112, 12, font, grey, W - 80);
  if (pt.validUntil) text(`Geldig t/m ${formatDayTime(pt.validUntil)}`, 40, pt.events.length !== 1 ? 94 : 112, 12, font, grey);

  // Voet.
  page.drawRectangle({ x: 0, y: 0, width: W, height: 8, color: orange });
  centered("Persoonlijk en niet overdraagbaar. Deel de QR-code niet met anderen: wie hem als eerste scant, komt binnen.", 48, 9, font, grey);
  centered("Tip: zet de helderheid van je scherm hoog als je het ticket op je telefoon laat zien.", 34, 9, font, grey);
  return pdf.save();
}
