import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { displayStatus, type TicketStatus } from "../rules";
import { qrCodeFor } from "../token";
import { BUILTIN_SETS } from "./builtin";
import { kindOf, type Format, type TicketKind } from "./fields";
import { chainFor, resolveAll, scopeKeyOf, stableStringify, type FullResolution, type LayerInput, type OverrideMap, type Resolved, type ScopeRef, type SetLayer } from "./resolve";
import { buildView, formatTicketNumber, usedAssetIds, type AssetMap, type AssetRef, type TicketFacts, type TicketView } from "./view";

// Ticketontwerp, serverdeel: lagen laden, effectieve instellingen bepalen, ontwerpen vastleggen bij
// uitgifte en de feitelijke ticketgegevens verzamelen. Eén plek, gebruikt door de editor, de
// mobiele ticketpagina, de pdf en de uitgifte.

type Db = Prisma.TransactionClient | typeof prisma;

export const assetUrl = (versionId: string) => `/api/public/ticket-assets/${versionId}`;

/** Maakt de ingebouwde basisontwerpen één keer aan (idempotent). */
export async function ensureBuiltinSets(db: Db = prisma): Promise<Record<string, string>> {
  const existing = await db.ticketDesignSet.findMany({ where: { builtinKey: { not: null } }, select: { id: true, builtinKey: true } });
  const byKey: Record<string, string> = Object.fromEntries(existing.map((s) => [s.builtinKey!, s.id]));
  for (const b of BUILTIN_SETS) {
    if (byKey[b.key]) continue;
    try {
      const set = await db.ticketDesignSet.create({ data: { name: b.name, description: b.description, kind: b.kind.toUpperCase(), builtinKey: b.key, createdBy: "Systeem" } });
      const key = `set:${set.id}`;
      const json = b.overrides as unknown as Prisma.InputJsonValue;
      await db.ticketDesignScope.create({ data: { scopeKey: key, level: "set", setId: set.id, published: json, publishedVersion: 1, publishedAt: new Date(), publishedByName: "Systeem (basisontwerp)" } });
      await db.ticketDesignScopeVersion.create({ data: { scopeKey: key, version: 1, overrides: json, note: "Basisontwerp", publishedByName: "Systeem (basisontwerp)" } });
      byKey[b.key] = set.id;
    } catch {
      // Gelijktijdig aangemaakt door een ander verzoek: opnieuw lezen.
      const again = await db.ticketDesignSet.findUnique({ where: { builtinKey: b.key }, select: { id: true } });
      if (again) byKey[b.key] = again.id;
    }
  }
  return byKey;
}

export const asMap = (v: unknown): OverrideMap => (v && typeof v === "object" ? (v as OverrideMap) : {});

/** Alle (niet-gearchiveerde) ontwerpsets met hun gepubliceerde inhoud, en de basisset per soort. */
export async function loadSets(db: Db = prisma, opts: { includeArchived?: boolean } = {}) {
  const builtin = await ensureBuiltinSets(db);
  const rows = await db.ticketDesignSet.findMany({ where: opts.includeArchived ? {} : { archivedAt: null }, orderBy: [{ builtinKey: "asc" }, { name: "asc" }] });
  const scopes = await db.ticketDesignScope.findMany({ where: { scopeKey: { in: rows.map((r) => `set:${r.id}`) } } });
  const byKey = new Map(scopes.map((s) => [s.scopeKey, s]));
  const sets: Record<string, SetLayer & { kind: string; version: number; archived: boolean; builtin: boolean; description: string | null }> = {};
  for (const r of rows) {
    const sc = byKey.get(`set:${r.id}`);
    // Een set zonder gepubliceerde versie kan niet gekozen worden.
    if (!sc || sc.publishedVersion < 1) continue;
    sets[r.id] = { id: r.id, name: r.name, overrides: asMap(sc.published), kind: r.kind, version: sc.publishedVersion, archived: !!r.archivedAt, builtin: !!r.builtinKey, description: r.description };
  }
  const fallback: Record<TicketKind, string | null> = { match: null, hospitality: null, season: null };
  for (const b of BUILTIN_SETS) fallback[b.kind] = builtin[b.key] && sets[builtin[b.key]] ? builtin[b.key] : null;
  return { sets, fallback, rows };
}

/** Leesbare naam van een niveau, voor de herkomst ("Van seizoen 2026/2027"). */
export async function scopeLabels(refs: ScopeRef[], db: Db = prisma): Promise<Record<string, string>> {
  const seasonIds = [...new Set(refs.map((r) => r.seasonId).filter(Boolean) as string[])];
  const eventIds = [...new Set(refs.map((r) => r.eventId).filter(Boolean) as string[])];
  const typeIds = [...new Set(refs.map((r) => r.typeId).filter(Boolean) as string[])];
  const setIds = [...new Set(refs.map((r) => r.setId).filter(Boolean) as string[])];
  const [seasons, events, types, sets] = await Promise.all([
    seasonIds.length ? db.ticketSeason.findMany({ where: { id: { in: seasonIds } }, select: { id: true, name: true } }) : [],
    eventIds.length ? db.ticketEvent.findMany({ where: { id: { in: eventIds } }, select: { id: true, title: true, startsAt: true } }) : [],
    typeIds.length ? db.ticketType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } }) : [],
    setIds.length ? db.ticketDesignSet.findMany({ where: { id: { in: setIds } }, select: { id: true, name: true } }) : [],
  ]);
  const s = new Map(seasons.map((x) => [x.id, x.name]));
  const e = new Map(events.map((x) => [x.id, `${x.title} (${formatDay(x.startsAt)})`]));
  const t = new Map(types.map((x) => [x.id, x.name]));
  const st = new Map(sets.map((x) => [x.id, x.name]));
  const out: Record<string, string> = {};
  for (const r of refs) {
    const type = r.typeId ? `tickettype ${t.get(r.typeId) ?? "onbekend"}` : "";
    const label =
      r.level === "set" ? `ontwerpset ${st.get(r.setId!) ?? ""}` :
      r.level === "club" ? "de clubstandaard" :
      r.level === "clubType" ? `de clubstandaard voor ${type}` :
      r.level === "season" ? `seizoen ${s.get(r.seasonId!) ?? ""}` :
      r.level === "seasonType" ? `seizoen ${s.get(r.seasonId!) ?? ""}, ${type}` :
      r.level === "event" ? `duel ${e.get(r.eventId!) ?? ""}` :
      `duel ${e.get(r.eventId!) ?? ""}, ${type}`;
    out[scopeKeyOf(r)] = label.trim();
  }
  return out;
}

export interface DesignContext {
  kind: TicketKind;
  typeId: string | null;
  seasonId: string | null;
  eventId: string | null;
}

/**
 * Effectieve instellingen voor een context. Standaard de gepubliceerde instellingen; met `draft`
 * wordt voor één niveau het concept gebruikt (voorbeeld in de editor en controles vóór publicatie).
 */
export async function resolveContext(ctx: DesignContext, opts: { draft?: { scopeKey: string; overrides: OverrideMap }; db?: Db } = {}): Promise<FullResolution & { scopeVersions: Record<string, number> }> {
  const db = opts.db ?? prisma;
  const { sets, fallback } = await loadSets(db);
  const refs = chainFor(ctx);
  const keys = refs.map(scopeKeyOf);
  const [rows, labels] = await Promise.all([db.ticketDesignScope.findMany({ where: { scopeKey: { in: keys } } }), scopeLabels(refs, db)]);
  const byKey = new Map(rows.map((r) => [r.scopeKey, r]));
  const scopeVersions: Record<string, number> = {};
  const chain: LayerInput[] = refs.map((r) => {
    const key = scopeKeyOf(r);
    const row = byKey.get(key);
    if (row && row.publishedVersion > 0) scopeVersions[key] = row.publishedVersion;
    const overrides = opts.draft?.scopeKey === key ? opts.draft.overrides : asMap(row?.published);
    return { level: r.level, scopeKey: key, label: labels[key] ?? key, overrides };
  });
  // Een concept van een ontwerpset zelf: die set als basis gebruiken.
  let setsForResolve: Record<string, SetLayer> = sets;
  if (opts.draft?.scopeKey.startsWith("set:")) {
    const id = opts.draft.scopeKey.slice(4);
    const name = sets[id]?.name ?? (await db.ticketDesignSet.findUnique({ where: { id }, select: { name: true } }))?.name ?? "concept";
    setsForResolve = { ...sets, [id]: { id, name, overrides: opts.draft.overrides } };
  }
  const res = resolveAll({ kind: ctx.kind, chain, sets: setsForResolve, fallbackSetId: fallback[ctx.kind] });
  if (res.setId) scopeVersions[`set:${res.setId}`] = sets[res.setId]?.version ?? 0;
  return { ...res, scopeVersions };
}

/** Actuele versies van de gebruikte afbeeldingen. */
export async function currentAssets(ids: string[], db: Db = prisma): Promise<AssetMap> {
  if (!ids.length) return {};
  const assets = await db.ticketDesignAsset.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, currentVersionId: true } });
  const versions = await db.ticketDesignAssetVersion.findMany({ where: { id: { in: assets.map((a) => a.currentVersionId).filter(Boolean) as string[] } }, select: { id: true, width: true, height: true } });
  const vmap = new Map(versions.map((v) => [v.id, v]));
  const out: AssetMap = {};
  for (const a of assets) {
    const v = a.currentVersionId ? vmap.get(a.currentVersionId) : null;
    if (v) out[a.id] = { assetId: a.id, versionId: v.id, url: assetUrl(v.id), width: v.width, height: v.height, name: a.name };
  }
  return out;
}

/** Vastgelegd ontwerp: beide formaten, met herkomst, gebruikte versies en afbeeldingsversies. */
export interface SnapshotContent {
  v: 1;
  kind: TicketKind;
  setId: string | null;
  scopeVersions: Record<string, number>;
  mobile: Resolved;
  a4: Resolved;
  assets: AssetMap;
}

const slim = (r: Resolved): Resolved => Object.fromEntries(Object.entries(r).map(([k, f]) => [k, { state: f.state, value: f.value, origin: f.origin, overridden: [] }]));

export async function snapshotFor(ctx: DesignContext, db: Db = prisma): Promise<{ id: string; content: SnapshotContent }> {
  const res = await resolveContext(ctx, { db });
  const ids = [...new Set([...usedAssetIds(res.mobile), ...usedAssetIds(res.a4)])];
  const content: SnapshotContent = { v: 1, kind: res.kind, setId: res.setId, scopeVersions: res.scopeVersions, mobile: slim(res.mobile), a4: slim(res.a4), assets: await currentAssets(ids, db) };
  const hash = createHash("sha256").update(stableStringify(content)).digest("hex");
  const row = await db.ticketDesignSnapshot.upsert({ where: { hash }, create: { hash, content: content as unknown as Prisma.InputJsonValue }, update: {}, select: { id: true } });
  return { id: row.id, content };
}

/** Ontwerpcontext van een ticket uit de bestaande gegevens (type, seizoen, gekoppelde wedstrijd). */
export function contextOfTicket(t: { typeId: string; seasonId: string | null; isSeasonCard: boolean; validityMode: string; category: string; links: { event: { id: string; seasonId: string | null } }[] }): DesignContext {
  const kind = kindOf({ isSeasonCard: t.isSeasonCard, validityMode: t.validityMode, category: t.category });
  // Alleen een ticket voor precies één wedstrijd heeft een duelcontext; een seizoenskaart nooit.
  const ev = kind !== "season" && t.links.length === 1 ? t.links[0].event : null;
  return { kind, typeId: t.typeId, seasonId: t.seasonId ?? ev?.seasonId ?? null, eventId: ev?.id ?? null };
}

/** Bij uitgifte: per ticket het effectieve ontwerp vastleggen (gelijke contexten delen één snapshot). */
export async function stampDesign(db: Db, ticketIds: string[]) {
  if (!ticketIds.length) return;
  const tickets = await db.ticket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, typeId: true, seasonId: true, isSeasonCard: true, validityMode: true, category: true, links: { select: { event: { select: { id: true, seasonId: true } } } } } });
  const byCtx = new Map<string, string[]>();
  const ctxs = new Map<string, DesignContext>();
  for (const t of tickets) {
    const c = contextOfTicket(t);
    const k = stableStringify(c);
    ctxs.set(k, c);
    byCtx.set(k, [...(byCtx.get(k) ?? []), t.id]);
  }
  const now = new Date();
  for (const [k, ids] of byCtx) {
    const snap = await snapshotFor(ctxs.get(k)!, db);
    await db.ticket.updateMany({ where: { id: { in: ids } }, data: { designSnapshotId: snap.id, designAppliedAt: now } });
  }
}

// ── Feitelijke gegevens van een echt ticket ─────────────────────────────────────

export const ticketInclude = {
  type: { select: { name: true, color: true } },
  zone: { select: { id: true, name: true } },
  season: { select: { name: true } },
  links: { select: { event: { select: { id: true, title: true, opponent: true, isHome: true, competition: true, startsAt: true, location: true, status: true, seasonId: true, season: { select: { name: true } }, match: { select: { opponent: { select: { logoUrl: true } } } } } } } },
} satisfies Prisma.TicketInclude;
export type TicketForDesign = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

function validityText(t: TicketForDesign): string {
  const season = t.season?.name ?? t.links[0]?.event.season?.name ?? null;
  if (t.validityMode === "SEASON") {
    const where = t.homeOnly ? "alle thuiswedstrijden" : "alle wedstrijden";
    const comp = t.competitions.length ? ` in ${t.competitions.join(", ")}` : "";
    return `Geldig voor ${where} van HHC Hardenberg${comp}${season ? ` in seizoen ${season}` : ""}`;
  }
  if (t.validityMode === "RANGE") return `Geldig van ${formatDay(t.validFrom)} t/m ${formatDay(t.validUntil)}`;
  if (t.links.length > 1) return `Geldig voor ${t.links.length} wedstrijden`;
  if (t.links.length === 1) return `Geldig voor ${t.links[0].event.title}`;
  return t.validUntil ? `Geldig t/m ${formatDay(t.validUntil)}` : "HHC Hardenberg";
}

export async function factsOfTicket(t: TicketForDesign, db: Db = prisma): Promise<TicketFacts> {
  const ctx = contextOfTicket(t);
  const ev = ctx.eventId ? t.links[0].event : null;
  const entrance = t.zoneId ? await db.ticketEntrance.findFirst({ where: { zoneId: t.zoneId, active: true }, orderBy: { createdAt: "asc" }, select: { name: true } }) : null;
  const notices: string[] = [];
  if (ev?.status === "CANCELLED") notices.push("Deze wedstrijd is afgelast. Bewaar je ticket: je hoort van HHC Hardenberg wat er verder gebeurt.");
  if (ev) {
    const since = t.designAppliedAt ?? t.createdAt;
    const moved = await db.ticketAuditEvent.findFirst({ where: { action: "event.moved", eventId: ev.id, at: { gt: since } }, orderBy: { at: "desc" }, select: { at: true } });
    if (moved) notices.push(`Deze wedstrijd is verplaatst. De datum en tijd hier zijn actueel (${formatDayTime(ev.startsAt)}). Een eerder gedownloade of geprinte versie toont nog de oude datum: download zo nodig het A4-ticket opnieuw.`);
  }
  const status = displayStatus({ status: t.status as TicketStatus, validUntil: t.validUntil }, new Date());
  const labels = { ACTIVE: "Actief", BLOCKED: "Geblokkeerd", CANCELLED: "Geannuleerd", EXPIRED: "Verlopen" } as const;
  return {
    sample: false,
    kind: ctx.kind,
    firstName: t.firstName,
    lastName: t.lastName,
    company: t.company,
    typeName: t.type.name,
    typeColor: t.type.color,
    ticketNumber: formatTicketNumber(t.publicId),
    qrCode: qrCodeFor(t.publicId, t.qrVersion),
    seasonName: t.season?.name ?? ev?.season?.name ?? null,
    validityText: validityText(t),
    event: ev ? { title: ev.title, opponent: ev.opponent, isHome: ev.isHome, competition: ev.competition, startsAt: ev.startsAt, location: ev.location, status: ev.status, opponentLogoUrl: ev.match?.opponent.logoUrl ?? null } : null,
    events: ctx.kind !== "season" && t.links.length > 1 ? t.links.map((l) => ({ title: l.event.title, startsAt: l.event.startsAt })).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()) : [],
    zoneName: t.zone?.name ?? null,
    entranceName: entrance?.name ?? null,
    notices,
    statusLabel: labels[status],
    usable: status === "ACTIVE",
  };
}

/** Het vastgelegde ontwerp van een ticket; tickets van vóór de ontwerpmodule krijgen het nu geldende ontwerp vastgelegd. */
export async function snapshotOfTicket(t: TicketForDesign, db: Db = prisma): Promise<SnapshotContent> {
  if (t.designSnapshotId) {
    const row = await db.ticketDesignSnapshot.findUnique({ where: { id: t.designSnapshotId } });
    if (row) return row.content as unknown as SnapshotContent;
  }
  const snap = await snapshotFor(contextOfTicket(t), db);
  await db.ticket.updateMany({ where: { id: t.id, designSnapshotId: t.designSnapshotId }, data: { designSnapshotId: snap.id, designAppliedAt: new Date() } });
  return snap.content;
}

/** Weergave van een echt ticket in één formaat, altijd uit het vastgelegde ontwerp. */
export async function ticketView(t: TicketForDesign, format: Format, db: Db = prisma): Promise<{ view: TicketView; snapshot: SnapshotContent; facts: TicketFacts }> {
  const [snapshot, facts] = await Promise.all([snapshotOfTicket(t, db), factsOfTicket(t, db)]);
  return { view: buildView(facts, format === "mobile" ? snapshot.mobile : snapshot.a4, format, snapshot.assets), snapshot, facts };
}

/** Bestandsinhoud van een afbeelding voor de pdf: eigen versies uit de database, het clublogo uit de Hub, tegenstanderslogo's via hun adres. */
export async function loadAssetBytes(a: AssetRef): Promise<Buffer | null> {
  if (a.versionId) {
    const v = await prisma.ticketDesignAssetVersion.findUnique({ where: { id: a.versionId }, select: { data: true } });
    return v ? Buffer.from(v.data) : null;
  }
  if (a.url.startsWith("/branding/")) {
    const fs = await import("fs/promises");
    const path = await import("path");
    return fs.readFile(path.join(process.cwd(), "public", a.url.replace(/^\/+/, "")));
  }
  if (/^https:\/\//.test(a.url)) {
    try {
      const res = await fetch(a.url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length < 8_000_000 ? buf : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Na een uitgifte (buiten de transactie): ontwerp vastleggen. Een fout houdt de uitgifte nooit tegen; dan gebeurt het bij de eerste weergave. */
export async function stampDesignSafe(ticketIds: string[]) {
  try {
    await ensureBuiltinSets();
    await stampDesign(prisma, ticketIds);
  } catch (error) {
    console.error("[tickets] ontwerp vastleggen mislukt", error instanceof Error ? error.message : error);
  }
}
