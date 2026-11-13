import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "./audit.server";
import { need, type TicketsActor } from "./authz.server";
import { deliverTicketMail, ticketLink } from "./delivery.server";
import { hitLimit, emailKey } from "./public-limit.server";
import { holderSchema } from "./schemas";
import { createTickets, prepareIssue } from "./tickets.server";

// Actiecodes: wie de code invult krijgt zelf tickets, zonder dat een medewerker iets hoeft uit te geven.
// Voorbeelden: "neem een vriend mee" (2 tickets per inwisseling) of een code voor een jeugdteam.

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Leesbare code zonder verwarrende tekens (geen 0/O, 1/I). */
export function newPromoCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("").replace(/(.{4})(.{4})/, "$1-$2");
}
export const normalizeCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

const promoSchema = z.object({
  name: z.string().trim().min(1, "Geef de actie een naam.").max(80),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
  code: z.string().trim().max(30).nullish().transform((v) => (v ? normalizeCode(v) : null)),
  typeId: z.string().min(1, "Kies een tickettype."),
  zoneId: z.string().max(40).nullish().transform((v) => v || null),
  seasonId: z.string().max(40).nullish().transform((v) => v || null),
  eventIds: z.array(z.string().min(1)).max(100).default([]),
  claimFrom: z.string().nullish().transform((v) => (v ? new Date(v) : null)),
  claimUntil: z.string().nullish().transform((v) => (v ? new Date(v) : null)),
  maxClaims: z.number().int().min(1, "Minstens 1 inwisseling.").max(10_000),
  maxPerEmail: z.number().int().min(1).max(20).default(1),
  ticketsPerClaim: z.number().int().min(1).max(10).default(1),
});

export async function listPromos(actor: TicketsActor) {
  need(actor, "tickets:bulk");
  const rows = await prisma.ticketPromo.findMany({ orderBy: { createdAt: "desc" }, include: { type: { select: { name: true } }, _count: { select: { claims: true } } } });
  return { promos: rows.map((p) => ({ id: p.id, code: p.code, name: p.name, type: p.type.name, active: p.active, claims: p._count.claims, maxClaims: p.maxClaims, ticketsPerClaim: p.ticketsPerClaim, maxPerEmail: p.maxPerEmail, claimUntil: p.claimUntil })) };
}

export async function savePromo(actor: TicketsActor, raw: unknown) {
  need(actor, "tickets:bulk");
  const input = promoSchema.parse(raw);
  // Controleer type, wedstrijden en geldigheid nu al, zodat de code later niet alsnog faalt.
  await prepareIssue({ typeId: input.typeId, zoneId: input.zoneId, eventIds: input.eventIds, seasonId: input.seasonId, validFrom: null, validUntil: null, holders: [{ firstName: "Test", lastName: "Test", email: null, phone: null, company: null, relation: null, note: null }], batchName: null, locale: "nl" });
  const code = input.code ?? newPromoCode();
  if (!/^[A-Z0-9-]{4,30}$/.test(code)) throw new ApiError(400, "Een code bestaat uit 4 tot 30 letters, cijfers of streepjes.");
  if (await prisma.ticketPromo.findUnique({ where: { code }, select: { id: true } })) throw new ApiError(409, "Deze code bestaat al.");
  const row = await prisma.ticketPromo.create({ data: { code, name: input.name, note: input.note, typeId: input.typeId, zoneId: input.zoneId, seasonId: input.seasonId, eventIds: input.eventIds, claimFrom: input.claimFrom, claimUntil: input.claimUntil, maxClaims: input.maxClaims, maxPerEmail: input.maxPerEmail, ticketsPerClaim: input.ticketsPerClaim, createdBy: actor.name } });
  await ticketAudit({ action: "promo.saved", actor: actorOf(actor), summary: `Actiecode '${row.name}' aangemaakt`, meta: { promoId: row.id } });
  return { id: row.id, code: row.code };
}

export async function setPromoActive(actor: TicketsActor, id: string, active: boolean) {
  need(actor, "tickets:bulk");
  const r = await prisma.ticketPromo.updateMany({ where: { id }, data: { active } });
  if (r.count !== 1) throw new ApiError(404, "Actie niet gevonden.");
  await ticketAudit({ action: "promo.saved", actor: actorOf(actor), summary: `Actiecode ${active ? "geactiveerd" : "uitgezet"}`, meta: { promoId: id } });
  return { ok: true };
}

type PromoState = { active: boolean; claimFrom: Date | null; claimUntil: Date | null; maxClaims: number; claimed: number };
/** Kan deze code nu ingewisseld worden? Puur, dus testbaar. */
export function promoAvailability(p: PromoState, now: Date): { ok: true } | { ok: false; message: string } {
  if (!p.active) return { ok: false, message: "Deze actie is niet (meer) actief." };
  if (p.claimFrom && now < p.claimFrom) return { ok: false, message: "Deze actie is nog niet begonnen." };
  if (p.claimUntil && now > p.claimUntil) return { ok: false, message: "Deze actie is afgelopen." };
  if (p.claimed >= p.maxClaims) return { ok: false, message: "Deze actie is helaas op." };
  return { ok: true };
}

/** Openbaar: wat de bezoeker ziet voordat hij de code invult. Geeft nooit meer prijs dan nodig. */
export async function publicPromoInfo(rawCode: string) {
  const p = await prisma.ticketPromo.findUnique({ where: { code: normalizeCode(rawCode) }, include: { _count: { select: { claims: true } } } });
  if (!p) throw new ApiError(404, "Deze code bestaat niet.");
  const events = p.eventIds.length ? await prisma.ticketEvent.findMany({ where: { id: { in: p.eventIds } }, orderBy: { startsAt: "asc" }, select: { title: true, startsAt: true } }) : [];
  const av = promoAvailability({ ...p, claimed: p._count.claims }, new Date());
  return { name: p.name, note: p.note, ticketsPerClaim: p.ticketsPerClaim, events: events.map((e) => ({ title: e.title, startsAt: e.startsAt })), available: av.ok, message: av.ok ? null : av.message };
}

const claimSchema = z.object({ code: z.string().min(1).max(40), firstName: holderSchema.shape.firstName, lastName: holderSchema.shape.lastName, email: z.string().trim().toLowerCase().email("Vul een geldig e-mailadres in.").max(200), locale: z.enum(["nl", "de", "en"]).default("nl") });

/** Openbaar: een code inwisselen. Beperkt per IP en per e-mailadres; nooit meer dan het maximum, ook niet bij gelijktijdige aanvragen. */
export async function claimPromo(raw: unknown, ip: string) {
  const input = claimSchema.parse(raw);
  if (await hitLimit("promo-ip", ip, 15, 3600_000)) throw new ApiError(429, "Te veel pogingen. Probeer het later opnieuw.");
  if (await hitLimit("promo-email", input.email, 5, 3600_000)) throw new ApiError(429, "Te veel pogingen met dit e-mailadres. Probeer het later opnieuw.");
  const promo = await prisma.ticketPromo.findUnique({ where: { code: normalizeCode(input.code) } });
  if (!promo) throw new ApiError(404, "Deze code bestaat niet.");

  const emailHash = emailKey(input.email);
  const ids = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"promo:" + promo.id}))`;
      const [claimed, mine] = await Promise.all([tx.ticketPromoClaim.count({ where: { promoId: promo.id } }), tx.ticketPromoClaim.count({ where: { promoId: promo.id, emailHash } })]);
      const av = promoAvailability({ ...promo, claimed }, new Date());
      if (!av.ok) throw new ApiError(409, av.message);
      if (mine >= promo.maxPerEmail) throw new ApiError(409, "Met dit e-mailadres is deze actie al ingewisseld.");
      const holders = [holderSchema.parse({ firstName: input.firstName, lastName: input.lastName, email: input.email, phone: "", company: "", relation: `Actie: ${promo.name}`, note: "" })];
      for (let i = 2; i <= promo.ticketsPerClaim; i++) holders.push(holderSchema.parse({ firstName: "Gast van", lastName: `${input.firstName} ${input.lastName}`, email: input.email, phone: "", company: "", relation: `Actie: ${promo.name}`, note: "" }));
      const prepared = await prepareIssue({ typeId: promo.typeId, zoneId: promo.zoneId, eventIds: promo.eventIds, seasonId: promo.seasonId, validFrom: null, validUntil: null, holders, batchName: null, locale: input.locale });
      const created = await createTickets(tx, { id: null, name: `Actiecode ${promo.name}` }, prepared, { originSystem: "PROMO" });
      await tx.ticketPromoClaim.create({ data: { promoId: promo.id, emailHash, ticketIds: created } });
      return created;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  // Mailen buiten de transactie; lukt het niet, dan blijft het ticket bestaan en staat de mislukking in het verzendlog.
  let mailed = false;
  try {
    await deliverTicketMail(ids[0], { id: null, name: `Actiecode ${promo.name}` });
    mailed = true;
    // Extra tickets (vriend) gaan naar hetzelfde adres, zodat de aanvrager ze kan doorgeven.
    for (const id of ids.slice(1)) await deliverTicketMail(id, { id: null, name: `Actiecode ${promo.name}` }).catch(() => {});
  } catch {
    mailed = false;
  }
  // Alleen buiten productie (test/preview, zonder maildienst) tonen we de link zelf, zodat de actie te testen is.
  let testLink: string | null = null;
  if (process.env.VERCEL_ENV !== "production" && !mailed) {
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ids[0] }, select: { publicId: true, linkVersion: true } });
    testLink = ticketLink(t.publicId, t.linkVersion);
  }
  return { count: ids.length, mailed, testLink };
}
