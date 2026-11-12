import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { sendTicketMails } from "./delivery.server";
import { holderSchema, issueSchema } from "./schemas";
import { issueTickets } from "./tickets.server";

// Gastenlijsten: vaste lijsten met relaties (sponsoren, gasten, jeugdteams) waarvoor je per wedstrijd
// in één keer tickets uitgeeft. Uitgeven gaat via de gewone uitgifte (batch, goedkeuring boven de drempel).

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });
export const GUEST_KINDS = { SPONSOR: "Sponsor", GUEST: "Gast", OTHER: "Overig" } as const;
const listSchema = z.object({ name: z.string().trim().min(1, "Geef de lijst een naam.").max(80), kind: z.enum(["SPONSOR", "GUEST", "OTHER"]).default("GUEST"), note: z.string().trim().max(300).nullish().transform((v) => v || null) });

export async function listGuestLists(actor: TicketsActor) {
  need(actor, "tickets:bulk");
  const rows = await prisma.ticketGuestList.findMany({ orderBy: { name: "asc" }, include: { members: { select: { seats: true } } } });
  return { lists: rows.map((l) => ({ id: l.id, name: l.name, kind: l.kind, note: l.note, members: l.members.length, seats: l.members.reduce((n, m) => n + m.seats, 0) })) };
}

export async function getGuestList(actor: TicketsActor, id: string) {
  need(actor, "tickets:bulk");
  const l = await prisma.ticketGuestList.findUnique({ where: { id }, include: { members: { orderBy: [{ lastName: "asc" }, { firstName: "asc" }] } } });
  if (!l) throw new ApiError(404, "Lijst niet gevonden.");
  return { id: l.id, name: l.name, kind: l.kind, note: l.note, members: l.members.map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, email: m.email, company: m.company, seats: m.seats })) };
}

export async function saveGuestList(actor: TicketsActor, id: string | null, raw: unknown) {
  need(actor, "tickets:bulk");
  const input = listSchema.parse(raw);
  const row = id ? await prisma.ticketGuestList.update({ where: { id }, data: input }) : await prisma.ticketGuestList.create({ data: { ...input, createdBy: actor.name } });
  await ticketAudit({ action: "list.saved", actor: actorOf(actor), summary: `Gastenlijst '${row.name}' ${id ? "gewijzigd" : "aangemaakt"}`, meta: { listId: row.id } });
  return { id: row.id };
}

export async function deleteGuestList(actor: TicketsActor, id: string) {
  need(actor, "tickets:bulk");
  await prisma.ticketGuestList.delete({ where: { id } }).catch(() => {
    throw new ApiError(404, "Lijst niet gevonden.");
  });
  await ticketAudit({ action: "list.deleted", actor: actorOf(actor), summary: "Gastenlijst verwijderd", meta: { listId: id } });
  return { ok: true };
}

/**
 * Regels uit een geplakte tekst of CSV: "voornaam achternaam; e-mail; bedrijf; aantal" (scheiding met ; , of tab).
 * Puur, dus testbaar. Geeft ook de regels die niet gelezen konden worden.
 */
export function parseMembers(text: string): { members: { firstName: string; lastName: string; email: string | null; company: string | null; seats: number }[]; errors: { line: number; message: string }[] } {
  const members: { firstName: string; lastName: string; email: string | null; company: string | null; seats: number }[] = [];
  const errors: { line: number; message: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = (/[;\t]/.test(line) ? line.split(/[;\t]/) : line.split(",")).map((c) => c.trim());
    const [name = "", email = "", company = "", seatsRaw = ""] = cells;
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return void errors.push({ line: i + 1, message: "Vul voor- en achternaam in." });
    const seats = seatsRaw ? Number(seatsRaw) : 1;
    if (!Number.isInteger(seats) || seats < 1 || seats > 50) return void errors.push({ line: i + 1, message: "Het aantal moet een getal van 1 tot 50 zijn." });
    const parsed = holderSchema.safeParse({ firstName: parts[0], lastName: parts.slice(1).join(" "), email });
    if (!parsed.success) return void errors.push({ line: i + 1, message: parsed.error.issues[0]?.message ?? "Ongeldige regel." });
    members.push({ firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email, company: company || null, seats });
  });
  return { members, errors };
}

export async function addMembers(actor: TicketsActor, listId: string, raw: { text?: string }) {
  need(actor, "tickets:bulk");
  const list = await prisma.ticketGuestList.findUnique({ where: { id: listId }, select: { id: true, name: true } });
  if (!list) throw new ApiError(404, "Lijst niet gevonden.");
  const { members, errors } = parseMembers(String(raw.text ?? ""));
  if (members.length > 500) throw new ApiError(400, "Maximaal 500 regels per keer.");
  if (members.length) await prisma.ticketGuestMember.createMany({ data: members.map((m) => ({ ...m, listId })) });
  await ticketAudit({ action: "list.saved", actor: actorOf(actor), summary: `${members.length} relaties toegevoegd aan een gastenlijst`, meta: { listId } });
  return { added: members.length, errors };
}

export async function removeMember(actor: TicketsActor, listId: string, memberId: string) {
  need(actor, "tickets:bulk");
  const r = await prisma.ticketGuestMember.deleteMany({ where: { id: memberId, listId } });
  if (r.count !== 1) throw new ApiError(404, "Relatie niet gevonden.");
  return { ok: true };
}

const issueFromListSchema = z.object({
  issue: issueSchema.omit({ holders: true, batchName: true }),
  memberIds: z.array(z.string().min(1)).max(2000).optional(),
  sendMail: z.boolean().default(false),
});

/** Uitgeven voor de hele lijst (of een selectie). Relaties die voor deze wedstrijd(en) al een ticket van dit type hebben, worden overgeslagen. */
export async function issueFromList(actor: TicketsActor, listId: string, raw: unknown) {
  need(actor, "tickets:issue");
  need(actor, "tickets:bulk");
  const input = issueFromListSchema.parse(raw);
  const list = await prisma.ticketGuestList.findUnique({ where: { id: listId }, include: { members: true } });
  if (!list) throw new ApiError(404, "Lijst niet gevonden.");
  const chosen = list.members.filter((m) => !input.memberIds || input.memberIds.includes(m.id));
  if (chosen.length === 0) throw new ApiError(400, "Er zijn geen relaties om tickets voor uit te geven.");

  // Al uitgegeven? Zelfde type, zelfde wedstrijd(en), zelfde naam en e-mail, niet geannuleerd.
  const existing = input.issue.eventIds.length
    ? await prisma.ticket.findMany({ where: { typeId: input.issue.typeId, status: { not: "CANCELLED" }, links: { some: { eventId: { in: input.issue.eventIds } } } }, select: { firstName: true, lastName: true, email: true } })
    : [];
  const key = (f: string, l: string, e: string | null) => `${f}|${l}|${e ?? ""}`.toLowerCase();
  const have = new Set(existing.map((t) => key(t.firstName, t.lastName, t.email)));

  let skipped = 0;
  const holders: z.infer<typeof holderSchema>[] = [];
  for (const m of chosen) {
    if (have.has(key(m.firstName, m.lastName, m.email))) {
      skipped++;
      continue;
    }
    holders.push(holderSchema.parse({ firstName: m.firstName, lastName: m.lastName, email: m.email ?? "", company: m.company ?? "", relation: list.name, note: "" }));
    for (let i = 2; i <= m.seats; i++) holders.push(holderSchema.parse({ firstName: "Gast van", lastName: `${m.firstName} ${m.lastName}`, email: m.email ?? "", company: m.company ?? "", relation: list.name, note: "" }));
  }
  if (holders.length === 0) return { pendingApproval: false as const, count: 0, skipped, mailed: 0, ticketIds: [] as string[] };

  const r = (await issueTickets(actor, { ...input.issue, holders, batchName: `Lijst: ${list.name}` }, "LIST")) as { pendingApproval: boolean; ticketIds?: string[]; count: number; batchId?: string };
  let mailed = 0;
  if (!r.pendingApproval && input.sendMail && r.ticketIds?.length) {
    try {
      mailed = (await sendTicketMails(actor, { ticketIds: r.ticketIds })).sent;
    } catch {
      // Het uitgeven is gelukt; mailen kan later opnieuw.
    }
  }
  return { ...r, skipped, mailed, ticketIds: r.ticketIds ?? [] };
}
