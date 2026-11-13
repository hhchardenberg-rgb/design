import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ticketAuditTx } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import type { CommercialTicketBridge, TicketIssueRequest, TicketIssueResult } from "./commercial-bridge";
import { holderSchema, issueSchema } from "./schemas";
import { getTicketSettings } from "./settings.server";
import { createTickets, prepareIssue } from "./tickets.server";

// Koppeling met Commerciële Zaken: tickets uitgeven voor een sponsor of relatie en het gebruik
// per bedrijf opvragen. Dezelfde regels als in het scherm (rechten, controle van type en
// wedstrijden, drempel), en idempotent per (originSystem, externalRef): twee keer dezelfde
// aanvraag maakt nooit dubbele tickets. Er is bewust geen openbare API: alleen server-code van
// de Hub roept dit aan, met de actor van de ingelogde gebruiker.

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });
const keyOf = (r: TicketIssueRequest) => JSON.stringify([r.typeId, r.zoneId ?? null, [...(r.eventIds ?? [])].sort(), r.seasonId ?? null]);

export async function issueFromCommercial(actor: TicketsActor, requests: TicketIssueRequest[]): Promise<TicketIssueResult[]> {
  need(actor, "tickets:issue");
  const settings = await getTicketSettings();
  const results = new Map<string, TicketIssueResult>();
  const ref = (r: TicketIssueRequest) => `${r.originSystem}\u0000${r.externalRef}`;

  const existing = await prisma.ticket.findMany({
    where: { OR: requests.map((r) => ({ originSystem: r.originSystem, externalRef: r.externalRef })) },
    select: { id: true, originSystem: true, externalRef: true },
  });
  for (const e of existing) results.set(`${e.originSystem}\u0000${e.externalRef}`, { externalRef: e.externalRef!, ticketId: e.id, status: "ALREADY_ISSUED" });

  const fresh = requests.filter((r) => !results.has(ref(r)));
  if (fresh.length > settings.bulkApprovalThreshold) {
    for (const r of fresh) results.set(ref(r), { externalRef: r.externalRef, ticketId: null, status: "PENDING_APPROVAL", message: `Meer dan ${settings.bulkApprovalThreshold} tickets in één keer: vraag dit aan via Bulkuitgifte, zodat iemand anders het goedkeurt.` });
  } else {
    const groups = new Map<string, TicketIssueRequest[]>();
    for (const r of fresh) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
    for (const group of groups.values()) {
      const first = group[0];
      try {
        const input = issueSchema.parse({ typeId: first.typeId, zoneId: first.zoneId ?? null, eventIds: first.eventIds ?? [], seasonId: first.seasonId ?? null, holders: group.map((g) => holderSchema.parse(g.holder)) });
        const prepared = await prepareIssue(input);
        const ids = await prisma.$transaction(async (tx) => {
          const created = await createTickets(tx, actorOf(actor), prepared, { originSystem: first.originSystem });
          for (let i = 0; i < created.length; i++) {
            await tx.ticket.update({ where: { id: created[i] }, data: { originSystem: group[i].originSystem, externalRef: group[i].externalRef, commercialCompanyId: group[i].commercialCompanyId ?? null } });
          }
          await ticketAuditTx(tx, { action: "ticket.created", actor: actorOf(actor), summary: "Tickets uitgegeven vanuit Commerciële Zaken", meta: { count: created.length, origin: first.originSystem } });
          return created;
        });
        group.forEach((g, i) => results.set(ref(g), { externalRef: g.externalRef, ticketId: ids[i], status: "ISSUED" }));
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          // Een gelijktijdige aanvraag was ons voor: dat telt als al uitgegeven.
          for (const g of group) results.set(ref(g), { externalRef: g.externalRef, ticketId: null, status: "ALREADY_ISSUED" });
          continue;
        }
        const message = error instanceof Error ? error.message : "Uitgeven mislukt.";
        for (const g of group) results.set(ref(g), { externalRef: g.externalRef, ticketId: null, status: "REJECTED", message });
      }
    }
  }
  return requests.map((r) => results.get(ref(r))!);
}

export async function usageForCompany(commercialCompanyId: string, seasonId: string) {
  const tickets = await prisma.ticket.findMany({
    where: { commercialCompanyId, status: { not: "CANCELLED" }, OR: [{ seasonId }, { links: { some: { event: { seasonId } } } }] },
    select: { id: true },
  });
  const ids = tickets.map((t) => t.id);
  const used = ids.length ? (await prisma.ticketScan.findMany({ where: { ticketId: { in: ids }, result: "VALID" }, select: { ticketId: true }, distinct: ["ticketId"] })).length : 0;
  return { issued: ids.length, used };
}

export const commercialBridge: CommercialTicketBridge = { issueFromCommercial, usageForCompany };
