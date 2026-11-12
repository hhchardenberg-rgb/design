import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { sendTicketEmail } from "@/lib/mail";
import { formatDayTime } from "@/lib/date-format";
import { ticketAudit } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { fillTemplate } from "./delivery";
import { loadTemplate, ticketLink } from "./delivery.server";
import { computeValidUntil, type ValidityMode } from "./rules";
import { coveringTickets } from "./scan.server";

// Afgelasten of verplaatsen in één klik: de wedstrijd wordt aangepast, de geldigheid van de tickets
// loopt mee en alle houders met een e-mailadres krijgen bericht. Tickets blijven geldig voor de nieuwe datum.

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });
const defaultEnd = (start: Date) => new Date(start.getTime() + 3 * 3600_000);

const changeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("MOVE"), startsAt: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Kies een geldige nieuwe datum en tijd."), endsAt: z.string().nullish(), message: z.string().trim().max(500).nullish(), sendMail: z.boolean().default(true), dryRun: z.boolean().default(false) }),
  z.object({ action: z.literal("CANCEL"), message: z.string().trim().max(500).nullish(), sendMail: z.boolean().default(true), dryRun: z.boolean().default(false) }),
]);

/** Eén ontvanger per e-mailadres (met zijn eerste ticket), zodat niemand zes dezelfde mails krijgt. Puur, dus testbaar. */
export function dedupeRecipients<T extends { email: string | null; id: string }>(tickets: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of [...tickets].sort((a, b) => a.id.localeCompare(b.id))) {
    const e = t.email?.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(t);
  }
  return out;
}

export async function changeEvent(actor: TicketsActor, eventId: string, raw: unknown) {
  need(actor, "events:manage");
  const input = changeSchema.parse(raw);
  if (input.sendMail && !input.dryRun) need(actor, "tickets:resend");
  const event = await prisma.ticketEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new ApiError(404, "Wedstrijd niet gevonden.");
  if (event.status === "CANCELLED" && input.action === "CANCEL") throw new ApiError(400, "Deze wedstrijd is al afgelast.");

  const oldStart = event.startsAt;
  const newStart = input.action === "MOVE" ? new Date(input.startsAt) : event.startsAt;
  const newEnd = input.action === "MOVE" ? (input.endsAt ? new Date(input.endsAt) : defaultEnd(newStart)) : event.endsAt;
  if (input.action === "MOVE" && newEnd <= newStart) throw new ApiError(400, "Het einde moet na de aftrap liggen.");

  // Wie krijgt bericht: HHC-tickets die voor deze wedstrijd gelden (ook seizoenspassen), actief en met e-mailadres.
  // Tickets die aan deze wedstrijd gekoppeld zijn tellen mee, ook als hun geldigheid al verlopen leek (na een eerdere afgelasting).
  const covering = await coveringTickets(event);
  const linked = await prisma.ticket.findMany({ where: { status: "ACTIVE", anonymizedAt: null, links: { some: { eventId } } }, select: { id: true } });
  const ids = [...new Set([...covering.map((t) => t.id), ...linked.map((t) => t.id)])];
  const withMail = ids.length ? await prisma.ticket.findMany({ where: { id: { in: ids }, email: { not: null }, anonymizedAt: null }, select: { id: true, publicId: true, linkVersion: true, firstName: true, email: true, type: { select: { name: true } } } }) : [];
  const kind = input.action === "MOVE" ? `EVENT_MOVED:${newStart.toISOString()}` : "EVENT_CANCELLED";
  const done = new Set((await prisma.ticketDelivery.findMany({ where: { eventId, kind, status: "SENT" }, select: { ticketId: true } })).map((d) => d.ticketId));
  const recipients = dedupeRecipients(withMail).filter((t) => !done.has(t.id));
  const fullhouseTickets = event.externalId ? await prisma.ticketExternalTicket.count({ where: { eventExtId: event.externalId, status: "VALID" } }) : 0;
  const preview = { recipients: recipients.length, hhcTickets: ids.length, fullhouseTickets, fullhouse: event.source === "FULLHOUSE" };
  if (input.dryRun) return { dryRun: true as const, ...preview };

  // 1. De wedstrijd en de geldigheid van de tickets bijwerken (één transactie).
  await prisma.$transaction(async (tx) => {
    await tx.ticketEvent.update({ where: { id: eventId }, data: input.action === "MOVE" ? { startsAt: newStart, endsAt: newEnd, status: event.status === "CANCELLED" || event.status === "CLOSED" ? "ACTIVE" : event.status } : { status: "CANCELLED" } });
    if (input.action === "MOVE") {
      // Tickets voor één of meer wedstrijden vervallen na het einde van hun laatste wedstrijd: dat einde loopt mee.
      const linked = await tx.ticket.findMany({ where: { validityMode: { in: ["SINGLE", "MULTI"] }, links: { some: { eventId } } }, select: { id: true, validityMode: true, links: { select: { event: { select: { id: true, endsAt: true } } } } } });
      for (const t of linked) {
        const validUntil = computeValidUntil(t.validityMode as ValidityMode, { events: t.links.map((l) => ({ endsAt: l.event.id === eventId ? newEnd : l.event.endsAt })) });
        await tx.ticket.update({ where: { id: t.id }, data: { validUntil } });
      }
    }
  });
  await ticketAudit({ action: input.action === "MOVE" ? "event.moved" : "event.cancelled", actor: actorOf(actor), eventId, oldStatus: event.status, newStatus: input.action === "MOVE" ? event.status : "CANCELLED", summary: input.action === "MOVE" ? `Wedstrijd verplaatst naar ${formatDayTime(newStart)}` : "Wedstrijd afgelast", meta: { recipients: recipients.length } });

  // 2. Bericht aan de houders. Elke verzending wordt vastgelegd, zodat opnieuw proberen niemand dubbel mailt.
  let sent = 0;
  let failed = 0;
  if (input.sendMail && recipients.length) {
    const tpl = await loadTemplate(input.action === "MOVE" ? "event_moved" : "event_cancelled");
    for (const t of recipients) {
      const link = ticketLink(t.publicId, t.linkVersion);
      const vars = { voornaam: t.firstName, achternaam: "", type: t.type.name, wedstrijd: event.title, datum: formatDayTime(newStart), oudedatum: formatDayTime(oldStart), bericht: input.message ?? "", link };
      const clean = (s: string) => s.replace(/\n{3,}/g, "\n\n").trim();
      try {
        await sendTicketEmail({ to: t.email!, subject: fillTemplate(tpl.subject, vars), bodyText: clean(fillTemplate(tpl.body, vars)), linkUrl: link, buttonLabel: "Bekijk je ticket" });
        await prisma.ticketDelivery.create({ data: { ticketId: t.id, channel: "EMAIL", status: "SENT", kind, eventId, byId: actor.id, byName: actor.name } });
        sent++;
      } catch (e) {
        await prisma.ticketDelivery.create({ data: { ticketId: t.id, channel: "EMAIL", status: "FAILED", kind, eventId, error: (e instanceof Error ? e.message : "Onbekende fout").slice(0, 300), byId: actor.id, byName: actor.name } });
        failed++;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return { dryRun: false as const, ...preview, sent, failed };
}
