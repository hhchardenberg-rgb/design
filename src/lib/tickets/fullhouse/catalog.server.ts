import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { ticketAudit } from "../audit.server";
import { need, type TicketsActor } from "../authz.server";
import type { TicketCategory } from "../rules";
import { ticketProvider } from "./index";
import type { FullhouseEvent } from "./types";

// Kaartsoorten en toegangsvakken uit Fullhouse (alleen lezen). Fullhouse geeft ze per evenement,
// met per evenement eigen id's; de Hub voegt ze samen op naam, zodat "Staanplaats" één regel is
// die je één keer aan een HHC-tickettype of -vak koppelt. Er gaat nooit iets terug naar Fullhouse.

export const nameKey = (v: string) => v.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const MAX_IDS = 400;

interface Acc {
  name: string;
  ids: Set<string>;
  events: Set<string>;
  price: number | null;
  category: string | null;
  active: boolean;
}

function add(map: Map<string, Acc>, name: string, id: string | null, eventId: string, extra: Partial<Pick<Acc, "price" | "category" | "active">> = {}) {
  const key = nameKey(name);
  if (!key) return;
  const a = map.get(key) ?? { name: name.trim().slice(0, 120), ids: new Set<string>(), events: new Set<string>(), price: null, category: null, active: false };
  if (id) a.ids.add(id);
  a.events.add(eventId);
  if (extra.price != null) a.price = extra.price;
  if (extra.category) a.category = extra.category;
  if (extra.active !== false) a.active = true;
  map.set(key, a);
}

/** Pure samenvoeging (testbaar): kaartsoorten en vakken uit evenementen, aangevuld met wat in de ticketcache staat. */
export function collectCatalog(events: FullhouseEvent[], cached: { eventExtId: string; ticketName: string | null; ticketTypeId: string | null; area: string | null; categoryRef: string | null }[]) {
  const types = new Map<string, Acc>();
  const zones = new Map<string, Acc>();
  const refName = new Map<string, string>();
  for (const e of events) {
    for (const c of e.categories ?? []) {
      refName.set(c.ref, c.name);
      add(zones, c.name, c.ref, e.externalId);
    }
  }
  for (const e of events) {
    for (const t of e.ticketTypes ?? []) {
      add(types, t.name, t.externalId, e.externalId, { price: t.price, category: (t.categoryRef && refName.get(t.categoryRef)) || null, active: t.active });
    }
  }
  // Aanvulling uit de ticketcache: kaartsoorten en vakken die Fullhouse niet in de evenementenlijst meegeeft (bv. bij een scanapparaat-token).
  for (const t of cached) {
    const zone = t.area ?? (t.categoryRef ? refName.get(t.categoryRef) : null) ?? null;
    if (t.ticketName && !types.has(nameKey(t.ticketName))) add(types, t.ticketName, t.ticketTypeId, t.eventExtId, { category: zone });
    if (zone && !zones.has(nameKey(zone))) add(zones, zone, t.categoryRef, t.eventExtId);
  }
  return { types, zones };
}

/** Haalt kaartsoorten en vakken binnen en werkt de lijst bij. Koppelt automatisch aan een HHC-type of -vak met precies dezelfde naam. */
export async function syncFullhouseCatalog(who: { id: string | null; name: string }, events?: FullhouseEvent[]) {
  const list = events ?? (await ticketProvider().listEvents());
  const cached = await prisma.ticketExternalTicket.groupBy({ by: ["eventExtId", "ticketName", "ticketTypeId", "area", "categoryRef"], where: { status: "VALID" } });
  const { types, zones } = collectCatalog(list, cached);
  const started = new Date();
  const [hhcTypes, hhcZones] = await Promise.all([prisma.ticketType.findMany({ select: { id: true, name: true } }), prisma.ticketZone.findMany({ select: { id: true, name: true } })]);
  const typeByName = new Map(hhcTypes.map((t) => [nameKey(t.name), t.id]));
  const zoneByName = new Map(hhcZones.map((z) => [nameKey(z.name), z.id]));
  let created = 0;
  let linked = 0;
  for (const [kind, map] of [["ZONE", zones], ["TYPE", types]] as const) {
    for (const [key, a] of map) {
      const existing = await prisma.ticketFullhouseItem.findUnique({ where: { kind_nameKey: { kind, nameKey: key } } });
      const ids = [...new Set([...a.ids, ...(existing?.externalIds ?? [])])].slice(0, MAX_IDS);
      const auto = kind === "ZONE" ? zoneByName.get(key) : typeByName.get(key);
      const data = { name: a.name, externalIds: ids, eventCount: Math.max(a.events.size, existing?.eventCount ?? 0), active: a.active || kind === "ZONE", lastSeenAt: started, ...(kind === "TYPE" ? { price: a.price, categoryRef: a.category } : {}) };
      if (existing) {
        const link = !existing.typeId && !existing.zoneId && auto ? (kind === "ZONE" ? { zoneId: auto } : { typeId: auto }) : {};
        if (Object.keys(link).length) linked++;
        await prisma.ticketFullhouseItem.update({ where: { id: existing.id }, data: { ...data, ...link } });
      } else {
        if (auto) linked++;
        await prisma.ticketFullhouseItem.create({ data: { kind, nameKey: key, ...data, ...(auto ? (kind === "ZONE" ? { zoneId: auto } : { typeId: auto }) : {}) } });
        created++;
      }
    }
  }
  // Alleen als Fullhouse echt kaartsoorten meegaf: wat niet meer voorkomt, is niet meer te koop.
  const sawTypes = list.some((e) => (e.ticketTypes ?? []).length > 0);
  if (sawTypes) await prisma.ticketFullhouseItem.updateMany({ where: { kind: "TYPE", lastSeenAt: { lt: started } }, data: { active: false } });
  const result = { types: types.size, zones: zones.size, created, linked };
  await ticketAudit({ action: "fullhouse.catalog", actor: { id: who.id, name: who.name }, meta: result });
  return result;
}

export async function refreshCatalogAction(actor: TicketsActor) {
  need(actor, "sync:manage");
  try {
    return await syncFullhouseCatalog({ id: actor.id, name: actor.name });
  } catch (e) {
    throw new ApiError(502, e instanceof Error ? e.message : "Fullhouse ophalen mislukt.");
  }
}

export async function catalogOverview(actor: TicketsActor) {
  need(actor, "sync:read");
  const [items, types, zones] = await Promise.all([
    prisma.ticketFullhouseItem.findMany({ orderBy: [{ kind: "asc" }, { active: "desc" }, { name: "asc" }], include: { type: { select: { name: true } }, zone: { select: { name: true } } } }),
    prisma.ticketType.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true } }),
    prisma.ticketZone.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, active: true } }),
  ]);
  return {
    items: items.map((i) => ({ id: i.id, kind: i.kind, name: i.name, price: i.price, category: i.categoryRef, active: i.active, eventCount: i.eventCount, lastSeenAt: i.lastSeenAt, typeId: i.typeId, typeName: i.type?.name ?? null, zoneId: i.zoneId, zoneName: i.zone?.name ?? null })),
    hhcTypes: types,
    hhcZones: zones,
  };
}

const linkSchema = z.object({
  // Koppelen aan een bestaand HHC-type/vak, ontkoppelen (null) of een nieuw HHC-type/vak aanmaken.
  targetId: z.string().max(40).nullable().optional(),
  create: z.boolean().optional(),
});

function guessCategory(name: string): TicketCategory {
  const n = name.toLowerCase();
  if (n.includes("seizoen")) return "SEASON";
  if (/\b(vip|business|skybox|lounge)/.test(n)) return "VIP";
  if (n.includes("pers")) return "PRESS";
  if (n.includes("sponsor") || n.includes("relatie")) return "SPONSOR";
  if (n.includes("actie") || n.includes("promo")) return "PROMOTION";
  return "FREE";
}

async function createHhcFor(item: { kind: string; name: string; categoryRef: string | null }): Promise<string> {
  if (item.kind === "ZONE") {
    const existing = await prisma.ticketZone.findFirst({ where: { name: { equals: item.name, mode: "insensitive" } }, select: { id: true } });
    if (existing) return existing.id;
    return (await prisma.ticketZone.create({ data: { name: item.name.slice(0, 80), description: "Overgenomen uit Fullhouse" } })).id;
  }
  const existing = await prisma.ticketType.findFirst({ where: { name: { equals: item.name, mode: "insensitive" } }, select: { id: true } });
  if (existing) return existing.id;
  // Vak van de kaartsoort: de Fullhouse-categorie, als die al aan een HHC-vak gekoppeld is.
  const zoneItem = item.categoryRef ? await prisma.ticketFullhouseItem.findUnique({ where: { kind_nameKey: { kind: "ZONE", nameKey: nameKey(item.categoryRef) } }, select: { zoneId: true } }) : null;
  const category = guessCategory(item.name);
  const season = category === "SEASON";
  try {
    const row = await prisma.ticketType.create({
      data: {
        name: item.name.slice(0, 80),
        description: "Overgenomen uit Fullhouse. Controleer de categorie en geldigheid en zet het type daarna op actief.",
        category,
        validityMode: season ? "SEASON" : "SINGLE",
        isSeasonCard: season,
        zoneId: zoneItem?.zoneId ?? null,
        // Niet meteen actief: een betaalde Fullhouse-kaartsoort hoort niet ongemerkt bij de HHC-uitgifte te staan.
        active: false,
      },
    });
    return row.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ApiError(409, "Er bestaat al een tickettype met deze naam.");
    throw e;
  }
}

export async function linkCatalogItem(actor: TicketsActor, id: string, raw: unknown) {
  need(actor, "sync:manage");
  const input = linkSchema.parse(raw);
  const item = await prisma.ticketFullhouseItem.findUnique({ where: { id } });
  if (!item) throw new ApiError(404, "Niet gevonden.");
  let target: string | null;
  if (input.create) {
    need(actor, "types:manage");
    target = await createHhcFor(item);
  } else {
    target = input.targetId ?? null;
    if (target) {
      const ok = item.kind === "ZONE" ? await prisma.ticketZone.findUnique({ where: { id: target }, select: { id: true } }) : await prisma.ticketType.findUnique({ where: { id: target }, select: { id: true } });
      if (!ok) throw new ApiError(400, item.kind === "ZONE" ? "Dat vak bestaat niet (meer)." : "Dat tickettype bestaat niet (meer).");
    }
  }
  const row = await prisma.ticketFullhouseItem.update({ where: { id }, data: item.kind === "ZONE" ? { zoneId: target } : { typeId: target } });
  await ticketAudit({ action: "fullhouse.linked", actor: { id: actor.id, name: actor.name }, meta: { itemId: id, kind: item.kind, target, created: !!input.create } });
  return row;
}

/** Alle nog niet gekoppelde regels in één keer overnemen: eerst de vakken, dan de kaartsoorten (die dan hun vak krijgen). */
export async function adoptAllCatalog(actor: TicketsActor) {
  need(actor, "sync:manage");
  need(actor, "types:manage");
  const zones = await prisma.ticketFullhouseItem.findMany({ where: { kind: "ZONE", zoneId: null } });
  for (const z of zones) await prisma.ticketFullhouseItem.update({ where: { id: z.id }, data: { zoneId: await createHhcFor(z) } });
  const types = await prisma.ticketFullhouseItem.findMany({ where: { kind: "TYPE", typeId: null, active: true } });
  for (const t of types) await prisma.ticketFullhouseItem.update({ where: { id: t.id }, data: { typeId: await createHhcFor(t) } });
  await ticketAudit({ action: "fullhouse.linked", actor: { id: actor.id, name: actor.name }, summary: "Fullhouse-kaartsoorten en -vakken overgenomen", meta: { zones: zones.length, types: types.length } });
  return { zones: zones.length, types: types.length };
}

/** Voor het overzicht van externe tickets: Fullhouse-naam → gekoppelde HHC-naam. */
export async function catalogNameMap() {
  const items = await prisma.ticketFullhouseItem.findMany({ where: { OR: [{ typeId: { not: null } }, { zoneId: { not: null } }] }, include: { type: { select: { name: true } }, zone: { select: { name: true } } } });
  return {
    type: new Map(items.filter((i) => i.kind === "TYPE" && i.type).map((i) => [i.nameKey, i.type!.name])),
    zone: new Map(items.filter((i) => i.kind === "ZONE" && i.zone).map((i) => [i.nameKey, i.zone!.name])),
  };
}
