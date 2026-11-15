import { createHash } from "crypto";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-guards";
import { formatDay } from "@/lib/date-format";
import { ticketAudit, ticketAuditData, ticketAuditTx } from "../audit.server";
import { need, type TicketsActor } from "../authz.server";
import { layoutForView } from "./pdf.server";
import { BLOCKS, FIELDS, FIELD_MAP, GROUPS, defaultFor, kindOf, type Format, type Layer, type TicketKind } from "./fields";
import { chainFor, diffOverrides, listOverrides, overrideCount, parseScopeKey, scopeKeyOf, stableStringify, type Override, type OverrideMap, type ScopeRef } from "./resolve";
import { sanitizeOverrides, unsupportedOverrides, viewIssues, type DesignIssue } from "./validate";
import { buildView, usedAssetIds, type SamplePreset } from "./view";
import { sampleFacts, type SampleEvent } from "./sample";
import { asMap, assetUrl, contextOfTicket, currentAssets, ensureBuiltinSets, loadSets, resolveContext, scopeLabels, snapshotFor, type DesignContext } from "./context.server";

// Ticketontwerp, beheerdeel: concepten, publiceren, versies, gevolgen, kopiëren, sjablonen,
// afbeeldingen en het opnieuw vormgeven van bestaande tickets. Alle rechten worden hier op de
// server gecontroleerd (ook als de knop in de editor al verborgen is).

const actorOf = (a: TicketsActor) => ({ id: a.id, name: a.name });
const json = (v: unknown) => v as Prisma.InputJsonValue;

export function requireScope(key: string): ScopeRef {
  const ref = parseScopeKey(key);
  if (!ref) throw new ApiError(400, "Onbekend niveau.");
  return ref;
}

async function assertScopeExists(ref: ScopeRef) {
  const checks: Promise<unknown>[] = [];
  if (ref.setId) checks.push(prisma.ticketDesignSet.findUnique({ where: { id: ref.setId }, select: { id: true } }).then((x) => x ?? Promise.reject(new ApiError(404, "Ontwerpset niet gevonden."))));
  if (ref.seasonId) checks.push(prisma.ticketSeason.findUnique({ where: { id: ref.seasonId }, select: { id: true } }).then((x) => x ?? Promise.reject(new ApiError(404, "Seizoen niet gevonden."))));
  if (ref.eventId) checks.push(prisma.ticketEvent.findUnique({ where: { id: ref.eventId }, select: { id: true } }).then((x) => x ?? Promise.reject(new ApiError(404, "Wedstrijd niet gevonden."))));
  if (ref.typeId) checks.push(prisma.ticketType.findUnique({ where: { id: ref.typeId }, select: { id: true } }).then((x) => x ?? Promise.reject(new ApiError(404, "Tickettype niet gevonden."))));
  await Promise.all(checks);
}

/** Valideert een afwijkingenlijst volledig, inclusief bestaande afbeeldingen en ontwerpsets. */
export async function cleanOverrides(raw: unknown, ref: ScopeRef): Promise<OverrideMap> {
  const { map, errors } = sanitizeOverrides(raw, { isSet: ref.level === "set" });
  if (errors.length) throw new ApiError(400, errors[0].message);
  const assetIds = new Set<string>();
  const setIds = new Set<string>();
  for (const { key, o } of listOverrides(map)) {
    if (o.m !== "value") continue;
    const f = FIELD_MAP[key];
    if (f.type === "asset" && typeof o.v === "string" && !o.v.startsWith("builtin:")) assetIds.add(o.v);
    if (f.type === "assets") for (const x of o.v as string[]) assetIds.add(x);
    if (f.type === "designSet") setIds.add(o.v as string);
  }
  if (assetIds.size) {
    const found = await prisma.ticketDesignAsset.count({ where: { id: { in: [...assetIds] }, currentVersionId: { not: null } } });
    if (found !== assetIds.size) throw new ApiError(400, "Een gekozen afbeelding bestaat niet (meer).");
  }
  if (setIds.size) {
    const { sets } = await loadSets();
    for (const id of setIds) if (!sets[id]) throw new ApiError(400, "Kies een gepubliceerde ontwerpset.");
  }
  return map;
}

// ── Editorgegevens ───────────────────────────────────────────────────────────

/** Alle niveaus die voor het voorbeeld van dit niveau nodig zijn (inclusief alle tickettype-varianten). */
function relatedKeysWhere(ref: ScopeRef): Prisma.TicketDesignScopeWhereInput {
  const or: Prisma.TicketDesignScopeWhereInput[] = [{ scopeKey: "club" }, { level: "clubType" }];
  if (ref.seasonId) or.push({ seasonId: ref.seasonId, level: { in: ["season", "seasonType"] } });
  if (ref.eventId) or.push({ eventId: ref.eventId, level: { in: ["event", "eventType"] } });
  if (ref.setId) or.push({ scopeKey: `set:${ref.setId}` });
  return { OR: or };
}

export async function editorData(actor: TicketsActor, scopeKey: string) {
  need(actor, "design:read");
  const ref = requireScope(scopeKey);
  await assertScopeExists(ref);
  await ensureBuiltinSets();
  // Bij een duel hoort het seizoen van dat duel in de keten.
  let eventFacts: (SampleEvent & { id: string; seasonId: string | null }) | null = null;
  if (ref.eventId) {
    const e = await prisma.ticketEvent.findUnique({ where: { id: ref.eventId }, select: { id: true, title: true, opponent: true, isHome: true, competition: true, startsAt: true, location: true, status: true, seasonId: true, match: { select: { opponent: { select: { logoUrl: true } } } } } });
    if (e) eventFacts = { id: e.id, title: e.title, opponent: e.opponent, isHome: e.isHome, competition: e.competition, startsAt: e.startsAt.toISOString(), location: e.location, status: e.status, seasonId: e.seasonId, opponentLogoUrl: e.match?.opponent.logoUrl ?? null };
    ref.seasonId = e?.seasonId ?? undefined;
  }
  const [rows, setsData, assets, types, seasons, events] = await Promise.all([
    prisma.ticketDesignScope.findMany({ where: relatedKeysWhere(ref) }),
    loadSets(prisma, { includeArchived: true }),
    listAssets(),
    prisma.ticketType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, category: true, isSeasonCard: true, validityMode: true, color: true, active: true, seasonId: true } }),
    prisma.ticketSeason.findMany({ orderBy: { startsOn: "desc" }, select: { id: true, name: true, startsOn: true, endsOn: true } }),
    prisma.ticketEvent.findMany({ where: { archivedAt: null }, orderBy: { startsAt: "desc" }, take: 300, select: { id: true, title: true, startsAt: true, seasonId: true, status: true } }),
  ]);
  const refs = rows.map((r) => parseScopeKey(r.scopeKey)).filter((x): x is ScopeRef => !!x);
  const labels = await scopeLabels([...refs, ref]);
  const setRows = await prisma.ticketDesignSet.findMany({ orderBy: [{ builtinKey: "asc" }, { name: "asc" }] });
  const setScopes = await prisma.ticketDesignScope.findMany({ where: { level: "set" } });
  const setScopeMap = new Map(setScopes.map((s) => [s.scopeKey, s]));
  const season = ref.seasonId ? seasons.find((s) => s.id === ref.seasonId) ?? null : null;
  return {
    scope: { key: scopeKeyOf(ref), ref, label: labels[scopeKeyOf(ref)] ?? scopeKey },
    can: { edit: actor.access.can("design:edit"), publish: actor.access.can("design:publish"), apply: actor.access.can("design:apply") },
    scopes: rows.map((r) => ({
      key: r.scopeKey,
      level: r.level,
      typeId: r.typeId,
      label: labels[r.scopeKey] ?? r.scopeKey,
      published: asMap(r.published),
      publishedVersion: r.publishedVersion,
      publishedAt: r.publishedAt,
      publishedBy: r.publishedByName,
      draft: r.draft ? asMap(r.draft) : null,
      draftRevision: r.draftRevision,
      draftUpdatedAt: r.draftUpdatedAt,
      draftUpdatedBy: r.draftUpdatedBy,
    })),
    labels,
    sets: setRows.map((s) => {
      const sc = setScopeMap.get(`set:${s.id}`);
      return { id: s.id, name: s.name, description: s.description, kind: s.kind.toLowerCase() as TicketKind, builtin: !!s.builtinKey, archived: !!s.archivedAt, sourceNote: s.sourceNote, published: sc && sc.publishedVersion > 0 ? asMap(sc.published) : null, publishedVersion: sc?.publishedVersion ?? 0, hasDraft: !!sc?.draft };
    }),
    fallbackSets: setsData.fallback,
    assets,
    types: types.map((t) => ({ ...t, kind: kindOf(t) })),
    seasons,
    events,
    event: eventFacts,
    season,
  };
}

// ── Concept bewaren ──────────────────────────────────────────────────────────

export async function saveDraft(actor: TicketsActor, raw: { scopeKey?: unknown; overrides?: unknown; revision?: unknown }) {
  need(actor, "design:edit");
  const ref = requireScope(String(raw.scopeKey ?? ""));
  const key = scopeKeyOf(ref);
  await assertScopeExists(ref);
  const overrides = await cleanOverrides(raw.overrides, ref);
  const revision = Number(raw.revision ?? 0);
  const row = await prisma.ticketDesignScope.findUnique({ where: { scopeKey: key } });
  // Concept gelijk aan het gepubliceerde: er staat niets open.
  const same = stableStringify(overrides) === stableStringify(asMap(row?.published));
  const data = { draft: same ? Prisma.DbNull : json(overrides), draftUpdatedAt: new Date(), draftUpdatedById: actor.id, draftUpdatedBy: actor.name, draftBaseVersion: row?.publishedVersion ?? 0 };
  if (!row) {
    if (revision !== 0) throw conflict(null);
    try {
      const created = await prisma.ticketDesignScope.create({ data: { scopeKey: key, level: ref.level, setId: ref.setId, seasonId: ref.seasonId, eventId: ref.eventId, typeId: ref.typeId, draftRevision: 1, ...data } });
      return { revision: created.draftRevision, savedAt: created.draftUpdatedAt, hasDraft: !same };
    } catch {
      throw conflict(await prisma.ticketDesignScope.findUnique({ where: { scopeKey: key } }));
    }
  }
  const res = await prisma.ticketDesignScope.updateMany({ where: { scopeKey: key, draftRevision: revision }, data: { ...data, draftRevision: { increment: 1 } } });
  if (res.count !== 1) throw conflict(await prisma.ticketDesignScope.findUnique({ where: { scopeKey: key } }));
  return { revision: revision + 1, savedAt: data.draftUpdatedAt, hasDraft: !same };
}

function conflict(row: { draftUpdatedBy: string | null; draftUpdatedAt: Date | null } | null) {
  const who = row?.draftUpdatedBy ? `${row.draftUpdatedBy}${row.draftUpdatedAt ? ` (${row.draftUpdatedAt.toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" })})` : ""}` : "een collega";
  return new ApiError(409, `Dit concept is intussen gewijzigd door ${who}. Laad de nieuwste versie; je eigen wijziging is niet opgeslagen.`);
}

export async function discardDraft(actor: TicketsActor, scopeKey: string) {
  need(actor, "design:edit");
  const ref = requireScope(scopeKey);
  const key = scopeKeyOf(ref);
  await prisma.ticketDesignScope.updateMany({ where: { scopeKey: key }, data: { draft: Prisma.DbNull, draftRevision: { increment: 1 }, draftUpdatedAt: new Date(), draftUpdatedById: actor.id, draftUpdatedBy: actor.name } });
  await ticketAudit({ action: "design.discarded", actor: actorOf(actor), summary: `Ontwerpconcept verworpen (${key})`, meta: { scopeKey: key } });
  return { ok: true };
}

// ── Controleren en publiceren ────────────────────────────────────────────────

/** Welke soorten tickets een niveau raakt. */
async function kindsFor(ref: ScopeRef): Promise<TicketKind[]> {
  if (ref.setId) {
    const s = await prisma.ticketDesignSet.findUnique({ where: { id: ref.setId }, select: { kind: true } });
    return [(s?.kind.toLowerCase() as TicketKind) ?? "match"];
  }
  if (ref.typeId) {
    const t = await prisma.ticketType.findUnique({ where: { id: ref.typeId }, select: { isSeasonCard: true, validityMode: true, category: true } });
    return t ? [kindOf(t)] : ["match"];
  }
  return ref.eventId ? ["match", "hospitality"] : ["match", "hospitality", "season"];
}

/**
 * Controleert een (concept)instelling zoals hij gepubliceerd zou worden: voor elke geraakte soort ticket
 * met korte én lange voorbeeldnamen, in beide formaten, inclusief de A4-paginacontrole.
 */
export async function checkScope(scopeKey: string, overrides: OverrideMap): Promise<{ issues: DesignIssue[] }> {
  const ref = requireScope(scopeKey);
  const key = scopeKeyOf(ref);
  let event: SampleEvent | null = null;
  let seasonId = ref.seasonId ?? null;
  let seasonName: string | null = null;
  if (ref.eventId) {
    const e = await prisma.ticketEvent.findUnique({ where: { id: ref.eventId }, select: { title: true, opponent: true, isHome: true, competition: true, startsAt: true, location: true, status: true, seasonId: true, season: { select: { name: true } } } });
    if (e) {
      event = { title: e.title, opponent: e.opponent, isHome: e.isHome, competition: e.competition, startsAt: e.startsAt.toISOString(), location: e.location, status: e.status, opponentLogoUrl: null };
      seasonId = e.seasonId;
      seasonName = e.season?.name ?? null;
    }
  } else if (seasonId) seasonName = (await prisma.ticketSeason.findUnique({ where: { id: seasonId }, select: { name: true } }))?.name ?? null;
  const issues: DesignIssue[] = [];
  const seen = new Set<string>();
  const add = (list: DesignIssue[], suffix: string) => {
    for (const i of list) {
      const k = `${i.level}|${i.message}`;
      if (seen.has(k)) continue;
      seen.add(k);
      issues.push({ ...i, message: i.message + suffix });
    }
  };
  const kinds = await kindsFor(ref);
  for (const kind of kinds) {
    const ctx: DesignContext = ref.setId ? { kind, typeId: null, seasonId: null, eventId: null } : { kind, typeId: ref.typeId ?? null, seasonId, eventId: kind === "season" ? null : ref.eventId ?? null };
    const res = await resolveContext(ctx, { draft: { scopeKey: key, overrides } });
    add(unsupportedOverrides(overrides, { mobile: res.mobile, a4: res.a4 }), "");
    const assets = await currentAssets([...new Set([...usedAssetIds(res.mobile), ...usedAssetIds(res.a4)])]);
    for (const preset of ["kort", "lang", "ontbrekend"] as SamplePreset[]) {
      const facts = sampleFacts({ kind, preset, event, seasonName });
      const suffix = kinds.length > 1 ? ` (${kind === "match" ? "wedstrijdticket" : kind === "hospitality" ? "hospitality" : "seizoenskaart"})` : "";
      add(viewIssues(buildView(facts, res.mobile, "mobile", assets)), suffix);
      const a4 = buildView(facts, res.a4, "a4", assets);
      add(viewIssues(a4), suffix);
      const layout = await layoutForView(a4, null);
      add(layout.issues.map((i) => (preset === "lang" && i.level === "warning" ? { ...i, message: `Bij lange namen: ${i.message}` } : i)), suffix);
    }
  }
  return { issues };
}

export async function publish(actor: TicketsActor, raw: { scopeKeys?: unknown; revisions?: unknown; note?: unknown }) {
  need(actor, "design:publish");
  const keys = Array.isArray(raw.scopeKeys) ? raw.scopeKeys.map(String) : [];
  if (!keys.length || keys.length > 50) throw new ApiError(400, "Kies wat je wilt publiceren.");
  const revisions = (raw.revisions && typeof raw.revisions === "object" ? raw.revisions : {}) as Record<string, number>;
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 300) || null : null;
  const refs = keys.map(requireScope);
  // Eerst alles controleren, buiten de transactie.
  const rows = await prisma.ticketDesignScope.findMany({ where: { scopeKey: { in: refs.map(scopeKeyOf) } } });
  const byKey = new Map(rows.map((r) => [r.scopeKey, r]));
  const checked: { key: string; ref: ScopeRef; overrides: OverrideMap; revision: number }[] = [];
  for (const ref of refs) {
    const key = scopeKeyOf(ref);
    const row = byKey.get(key);
    if (!row?.draft) throw new ApiError(400, `Er is geen concept om te publiceren (${key}).`);
    if (revisions[key] !== undefined && revisions[key] !== row.draftRevision) throw conflict(row);
    const overrides = await cleanOverrides(row.draft, ref);
    const { issues } = await checkScope(key, overrides);
    const errors = issues.filter((i) => i.level === "error");
    if (errors.length) throw new ApiError(400, `Publiceren kan nog niet: ${errors[0].message}`);
    checked.push({ key, ref, overrides, revision: row.draftRevision });
  }
  // Alles of niets: beide formaten en alle gekozen niveaus in één transactie.
  const now = new Date();
  const versions = await prisma.$transaction(async (tx) => {
    const out: Record<string, number> = {};
    for (const c of checked) {
      const res = await tx.ticketDesignScope.updateMany({
        where: { scopeKey: c.key, draftRevision: c.revision },
        data: { published: json(c.overrides), publishedVersion: { increment: 1 }, publishedAt: now, publishedById: actor.id, publishedByName: actor.name, draft: Prisma.DbNull, draftRevision: { increment: 1 } },
      });
      if (res.count !== 1) throw conflict(await tx.ticketDesignScope.findUnique({ where: { scopeKey: c.key } }));
      const row = await tx.ticketDesignScope.findUniqueOrThrow({ where: { scopeKey: c.key }, select: { publishedVersion: true } });
      await tx.ticketDesignScopeVersion.create({ data: { scopeKey: c.key, version: row.publishedVersion, overrides: json(c.overrides), note, publishedById: actor.id, publishedByName: actor.name } });
      await ticketAuditTx(tx, { action: "design.published", actor: actorOf(actor), eventId: c.ref.eventId ?? null, summary: `Ticketontwerp gepubliceerd: ${c.key} versie ${row.publishedVersion}`, meta: { scopeKey: c.key, version: row.publishedVersion, overrides: overrideCount(c.overrides) } });
      out[c.key] = row.publishedVersion;
    }
    return out;
  });
  return { versions };
}

// ── Versies ──────────────────────────────────────────────────────────────────

export async function history(actor: TicketsActor, scopeKey: string) {
  need(actor, "design:read");
  const key = scopeKeyOf(requireScope(scopeKey));
  const versions = await prisma.ticketDesignScopeVersion.findMany({ where: { scopeKey: key }, orderBy: { version: "desc" }, take: 50 });
  const audit = await prisma.ticketAuditEvent.findMany({ where: { action: { startsWith: "design." }, meta: { path: ["scopeKey"], equals: key } }, orderBy: { at: "desc" }, take: 30, select: { at: true, actorName: true, summary: true } });
  return {
    versions: versions.map((v, i) => ({ version: v.version, at: v.publishedAt, by: v.publishedByName, note: v.note, count: overrideCount(asMap(v.overrides)), changes: diffOverrides(asMap(versions[i + 1]?.overrides), asMap(v.overrides)).length })),
    log: audit,
  };
}

/** Een eerdere versie terugzetten als concept (scan- en transactiegegevens blijven onaangeroerd). */
export async function restoreVersion(actor: TicketsActor, raw: { scopeKey?: unknown; version?: unknown }) {
  need(actor, "design:edit");
  const ref = requireScope(String(raw.scopeKey ?? ""));
  const key = scopeKeyOf(ref);
  const v = await prisma.ticketDesignScopeVersion.findUnique({ where: { scopeKey_version: { scopeKey: key, version: Number(raw.version) } } });
  if (!v) throw new ApiError(404, "Versie niet gevonden.");
  // Afbeeldingen of sets die intussen weg zijn, weigeren we netjes.
  const overrides = await cleanOverrides(v.overrides, ref);
  await prisma.ticketDesignScope.update({ where: { scopeKey: key }, data: { draft: json(overrides), draftRevision: { increment: 1 }, draftUpdatedAt: new Date(), draftUpdatedById: actor.id, draftUpdatedBy: actor.name } });
  await ticketAudit({ action: "design.restored", actor: actorOf(actor), summary: `Versie ${v.version} teruggezet als concept (${key})`, meta: { scopeKey: key, version: v.version } });
  return { ok: true };
}

// ── Gevolgen van een wijziging ───────────────────────────────────────────────

const shadows = (o: OverrideMap, layer: Layer, key: string) => (layer === "shared" ? !!(o.shared?.[key] || o.mobile?.[key] || o.a4?.[key]) : !!(o.shared?.[key] || o[layer]?.[key]));

export async function impact(actor: TicketsActor, raw: { scopeKey?: unknown; overrides?: unknown }) {
  need(actor, "design:read");
  const ref = requireScope(String(raw.scopeKey ?? ""));
  const key = scopeKeyOf(ref);
  const row = await prisma.ticketDesignScope.findUnique({ where: { scopeKey: key } });
  const draft = raw.overrides !== undefined ? (await cleanOverrides(raw.overrides, ref)) : asMap(row?.draft ?? row?.published);
  const changes = diffOverrides(asMap(row?.published), draft);
  // Lagere niveaus die (deels) volgen.
  const below: Prisma.TicketDesignScopeWhereInput =
    ref.level === "set" ? { level: { notIn: ["set"] } } :
    ref.level === "club" ? { level: { notIn: ["set", "club"] } } :
    ref.level === "clubType" ? { typeId: ref.typeId, level: { in: ["seasonType", "eventType"] } } :
    ref.level === "season" ? { OR: [{ seasonId: ref.seasonId, level: "seasonType" }, { level: { in: ["event", "eventType"] }, eventId: { in: (await prisma.ticketEvent.findMany({ where: { seasonId: ref.seasonId }, select: { id: true } })).map((e) => e.id) } }] } :
    ref.level === "seasonType" ? { typeId: ref.typeId, level: "eventType", eventId: { in: (await prisma.ticketEvent.findMany({ where: { seasonId: ref.seasonId }, select: { id: true } })).map((e) => e.id) } } :
    ref.level === "event" ? { eventId: ref.eventId, level: "eventType" } : { id: "__none__" };
  const lower = await prisma.ticketDesignScope.findMany({ where: below });
  const labels = await scopeLabels(lower.map((l) => parseScopeKey(l.scopeKey)).filter((x): x is ScopeRef => !!x));
  const protectedBy = changes.map((c) => ({
    field: FIELD_MAP[c.key]?.label ?? c.key,
    layer: c.layer,
    scopes: lower.filter((l) => shadows(asMap(l.published), c.layer, c.key)).map((l) => labels[l.scopeKey] ?? l.scopeKey),
  }));
  // Wat volgt er: seizoenen, duels en tickettypes binnen dit niveau.
  const now = new Date();
  const [seasons, events, types] = await Promise.all([
    ref.level === "club" || ref.level === "clubType" || ref.level === "set" ? prisma.ticketSeason.count() : Promise.resolve(ref.seasonId ? 1 : 0),
    ref.eventId ? Promise.resolve(1) : prisma.ticketEvent.count({ where: { archivedAt: null, endsAt: { gte: now }, ...(ref.seasonId ? { seasonId: ref.seasonId } : {}) } }),
    ref.typeId ? Promise.resolve(1) : prisma.ticketType.count({ where: { active: true } }),
  ]);
  // Uitgegeven tickets veranderen niet; alleen een bewuste heruitgave past ze aan.
  const issued = await prisma.ticket.count({ where: { status: "ACTIVE", anonymizedAt: null, ...ticketScopeWhere(ref) } });
  let usedBy: string[] = [];
  if (ref.setId) {
    const users = await prisma.ticketDesignScope.findMany({ where: { level: { not: "set" } }, select: { scopeKey: true, published: true } });
    const refsUsing = users.filter((u) => Object.entries(asMap(u.published).shared ?? {}).some(([k, o]) => k.startsWith("design.") && (o as Override).m === "value" && (o as { v: unknown }).v === ref.setId)).map((u) => parseScopeKey(u.scopeKey)).filter((x): x is ScopeRef => !!x);
    const l = await scopeLabels(refsUsing);
    usedBy = refsUsing.map((r) => l[scopeKeyOf(r)]);
  }
  return {
    changes: changes.map((c) => ({ field: FIELD_MAP[c.key]?.label ?? c.key, key: c.key, layer: c.layer, before: c.before ?? null, after: c.after ?? null })),
    follows: { seasons, upcomingEvents: events, activeTypes: types },
    protectedBy,
    lowerScopes: lower.length,
    issuedTickets: issued,
    usedBy,
  };
}

function ticketScopeWhere(ref: ScopeRef): Prisma.TicketWhereInput {
  const w: Prisma.TicketWhereInput = {};
  if (ref.typeId) w.typeId = ref.typeId;
  if (ref.eventId) w.links = { some: { eventId: ref.eventId } };
  else if (ref.seasonId) w.OR = [{ seasonId: ref.seasonId }, { links: { some: { event: { seasonId: ref.seasonId } } } }];
  return w;
}

// ── Kopiëren, sjablonen en ontwerpsets ───────────────────────────────────────

const REVIEW_GROUPS = new Set(["sponsoren", "praktisch", "voettekst", "boodschap", "extra", "sfeerbeeld"]);

/**
 * Neemt ontwerpinstellingen over van een ander seizoen of duel (inclusief de varianten per tickettype)
 * als concept. Het is een zelfstandige kopie: geen verwijzing, geen tickets, geen persoonsgegevens,
 * geen scans en geen wedstrijddatums.
 */
export async function copyScopes(actor: TicketsActor, raw: { from?: unknown; to?: unknown; overwrite?: unknown }) {
  need(actor, "design:edit");
  const from = requireScope(String(raw.from ?? ""));
  const to = requireScope(String(raw.to ?? ""));
  if (!((from.level === "season" && to.level === "season") || (from.level === "event" && to.level === "event"))) throw new ApiError(400, "Kopiëren kan van seizoen naar seizoen of van duel naar duel.");
  if (scopeKeyOf(from) === scopeKeyOf(to)) throw new ApiError(400, "Kies een ander seizoen of duel.");
  await assertScopeExists(to);
  const source = await prisma.ticketDesignScope.findMany({ where: from.level === "season" ? { seasonId: from.seasonId, level: { in: ["season", "seasonType"] } } : { eventId: from.eventId, level: { in: ["event", "eventType"] } } });
  const existing = await prisma.ticketDesignScope.findMany({ where: to.level === "season" ? { seasonId: to.seasonId, level: { in: ["season", "seasonType"] } } : { eventId: to.eventId, level: { in: ["event", "eventType"] } } });
  if (existing.some((e) => e.draft || overrideCount(asMap(e.published)) > 0) && raw.overwrite !== true) {
    throw new ApiError(409, "Het doel heeft al eigen instellingen of een concept. Bevestig dat je die als concept wilt vervangen.");
  }
  const review = new Set<string>();
  let count = 0;
  await prisma.$transaction(async (tx) => {
    for (const s of source) {
      const map = asMap(s.published);
      if (!overrideCount(map)) continue;
      const target: ScopeRef = to.level === "season" ? { level: s.typeId ? "seasonType" : "season", seasonId: to.seasonId, typeId: s.typeId ?? undefined } : { level: s.typeId ? "eventType" : "event", eventId: to.eventId, typeId: s.typeId ?? undefined };
      const key = scopeKeyOf(target);
      for (const { key: k } of listOverrides(map)) if (REVIEW_GROUPS.has(FIELD_MAP[k]?.group)) review.add(FIELD_MAP[k].label);
      await tx.ticketDesignScope.upsert({
        where: { scopeKey: key },
        create: { scopeKey: key, level: target.level, seasonId: target.seasonId, eventId: target.eventId, typeId: target.typeId, draft: json(map), draftRevision: 1, draftUpdatedAt: new Date(), draftUpdatedById: actor.id, draftUpdatedBy: actor.name },
        update: { draft: json(map), draftRevision: { increment: 1 }, draftUpdatedAt: new Date(), draftUpdatedById: actor.id, draftUpdatedBy: actor.name },
      });
      count++;
    }
    await ticketAuditTx(tx, { action: "design.copied", actor: actorOf(actor), summary: `Ontwerpinstellingen overgenomen van ${scopeKeyOf(from)} naar ${scopeKeyOf(to)} (als concept)`, meta: { scopeKey: scopeKeyOf(to), from: scopeKeyOf(from), scopes: count } });
  });
  return { copied: count, review: [...review] };
}

export async function createSet(actor: TicketsActor, raw: { name?: unknown; kind?: unknown; fromSetId?: unknown; description?: unknown }) {
  need(actor, "design:edit");
  const name = String(raw.name ?? "").trim().slice(0, 80);
  if (name.length < 2) throw new ApiError(400, "Geef de ontwerpset een naam.");
  const kind = (["match", "hospitality", "season"] as const).find((k) => k === raw.kind) ?? "match";
  let base: OverrideMap = {};
  if (typeof raw.fromSetId === "string" && raw.fromSetId) {
    const sc = await prisma.ticketDesignScope.findUnique({ where: { scopeKey: `set:${raw.fromSetId}` } });
    base = asMap(sc?.published);
  }
  const set = await prisma.$transaction(async (tx) => {
    const s = await tx.ticketDesignSet.create({ data: { name, kind: kind.toUpperCase(), description: typeof raw.description === "string" ? raw.description.slice(0, 300) : null, createdBy: actor.name } });
    await tx.ticketDesignScope.create({ data: { scopeKey: `set:${s.id}`, level: "set", setId: s.id, draft: json(base), draftRevision: 1, draftUpdatedAt: new Date(), draftUpdatedById: actor.id, draftUpdatedBy: actor.name } });
    await ticketAuditTx(tx, { action: "design.set_saved", actor: actorOf(actor), summary: `Ontwerpset '${name}' aangemaakt`, meta: { scopeKey: `set:${s.id}` } });
    return s;
  });
  return { id: set.id, scopeKey: `set:${set.id}` };
}

export async function updateSet(actor: TicketsActor, id: string, raw: { name?: unknown; description?: unknown; archived?: unknown }) {
  need(actor, "design:publish");
  const data: Prisma.TicketDesignSetUpdateInput = {};
  if (typeof raw.name === "string" && raw.name.trim().length >= 2) data.name = raw.name.trim().slice(0, 80);
  if (typeof raw.description === "string") data.description = raw.description.slice(0, 300);
  if (raw.archived === true) {
    // Een set die nog als standaard gekozen is, kan niet weg.
    const users = await prisma.ticketDesignScope.findMany({ where: { level: { not: "set" } }, select: { published: true, draft: true } });
    const used = users.some((u) => [u.published, u.draft].some((m) => Object.entries(asMap(m).shared ?? {}).some(([k, o]) => k.startsWith("design.") && (o as { v?: unknown }).v === id)));
    if (used) throw new ApiError(409, "Deze ontwerpset is nog ergens als standaard gekozen. Kies daar eerst een andere set.");
    const s = await prisma.ticketDesignSet.findUnique({ where: { id }, select: { builtinKey: true } });
    if (s?.builtinKey) throw new ApiError(400, "Een basisontwerp kan niet worden gearchiveerd; je kunt het wel aanpassen.");
    data.archivedAt = new Date();
  }
  if (raw.archived === false) data.archivedAt = null;
  await prisma.ticketDesignSet.update({ where: { id }, data });
  await ticketAudit({ action: "design.set_saved", actor: actorOf(actor), summary: `Ontwerpset bijgewerkt`, meta: { scopeKey: `set:${id}` } });
  return { ok: true };
}

/**
 * "Bewaar als herbruikbaar sjabloon": de effectieve opmaak van een duel wordt een nieuwe ontwerpset
 * (concept). Wedstrijdspecifieke waarden (tegenstander, titel, datum) worden dynamische velden.
 */
export async function saveEventAsSet(actor: TicketsActor, raw: { eventId?: unknown; name?: unknown; typeId?: unknown }) {
  need(actor, "design:edit");
  const eventId = String(raw.eventId ?? "");
  const e = await prisma.ticketEvent.findUnique({ where: { id: eventId }, select: { id: true, title: true, opponent: true, startsAt: true, seasonId: true } });
  if (!e) throw new ApiError(404, "Wedstrijd niet gevonden.");
  const name = String(raw.name ?? "").trim().slice(0, 80) || `Sjabloon van ${e.title}`;
  const typeId = typeof raw.typeId === "string" && raw.typeId ? raw.typeId : null;
  const type = typeId ? await prisma.ticketType.findUnique({ where: { id: typeId }, select: { isSeasonCard: true, validityMode: true, category: true } }) : null;
  const kind = type ? kindOf(type) : "match";
  const res = await resolveContext({ kind, typeId, seasonId: e.seasonId, eventId: e.id });
  const replacements: [string, string][] = [
    [e.title, "{{wedstrijd}}"],
    ...(e.opponent ? ([[e.opponent, "{{uitclub}}"]] as [string, string][]) : []),
    [formatDay(e.startsAt), "{{wedstrijddatum}}"],
  ];
  const replaced = new Set<string>();
  const map: OverrideMap = {};
  for (const f of FIELDS) {
    if (f.type === "designSet") continue;
    const per: Record<Format, { o: Override } | null> = { mobile: null, a4: null };
    for (const fmt of ["mobile", "a4"] as Format[]) {
      const r = (fmt === "mobile" ? res.mobile : res.a4)[f.key];
      if (!r || r.origin.level === "default") continue;
      let o: Override = r.state === "value" ? { m: "value", v: r.value } : { m: r.state };
      if (o.m === "value" && typeof o.v === "string" && (f.type === "text" || f.type === "longtext")) {
        let t = o.v;
        for (const [from, to] of replacements) if (from && t.includes(from)) {
          t = t.split(from).join(to);
          replaced.add(f.label);
        }
        o = { m: "value", v: t };
      }
      per[fmt] = { o };
    }
    const m = per.mobile;
    const a = per.a4;
    if (m && a && stableStringify(m.o) === stableStringify(a.o)) (map.shared ??= {})[f.key] = m.o;
    else {
      if (m) (map.mobile ??= {})[f.key] = m.o;
      if (a) (map.a4 ??= {})[f.key] = a.o;
    }
  }
  const { map: clean } = sanitizeOverrides(map, { isSet: true });
  const set = await prisma.$transaction(async (tx) => {
    const s = await tx.ticketDesignSet.create({ data: { name, kind: kind.toUpperCase(), description: `Opmaak overgenomen van ${e.title} (${formatDay(e.startsAt)}).`, sourceNote: replaced.size ? `Wedstrijdspecifieke tekst vervangen door dynamische velden in: ${[...replaced].join(", ")}.` : null, createdBy: actor.name } });
    await tx.ticketDesignScope.create({ data: { scopeKey: `set:${s.id}`, level: "set", setId: s.id, draft: json(clean), draftRevision: 1, draftUpdatedAt: new Date(), draftUpdatedById: actor.id, draftUpdatedBy: actor.name } });
    await ticketAuditTx(tx, { action: "design.set_saved", actor: actorOf(actor), eventId: e.id, summary: `Sjabloon '${name}' gemaakt van een duel`, meta: { scopeKey: `set:${s.id}` } });
    return s;
  });
  return { id: set.id, scopeKey: `set:${set.id}`, replaced: [...replaced] };
}

// ── Seizoensoverzicht ────────────────────────────────────────────────────────

export async function seasonOverview(actor: TicketsActor, seasonId: string) {
  need(actor, "design:read");
  const events = await prisma.ticketEvent.findMany({ where: { seasonId, archivedAt: null }, orderBy: { startsAt: "asc" }, select: { id: true, title: true, startsAt: true, status: true } });
  const scopes = await prisma.ticketDesignScope.findMany({ where: { OR: [{ eventId: { in: events.map((e) => e.id) } }, { seasonId }] } });
  return {
    events: events.map((e) => {
      const own = scopes.filter((s) => s.eventId === e.id);
      const general = own.find((s) => s.level === "event");
      const published = own.reduce((n, s) => n + overrideCount(asMap(s.published)), 0);
      const fields = [...new Set(own.flatMap((s) => listOverrides(asMap(s.published)).map((o) => FIELD_MAP[o.key]?.group)))].filter(Boolean).map((g) => GROUPS.find((x) => x.key === g)?.label ?? g);
      return { id: e.id, title: e.title, startsAt: e.startsAt, status: e.status, follows: published === 0, deviations: published, groups: fields, hasDraft: own.some((s) => !!s.draft), designSet: (asMap(general?.published).shared?.["design.match"] as { v?: string } | undefined)?.v ?? null };
    }),
    typeScopes: scopes.filter((s) => s.level === "seasonType").map((s) => ({ typeId: s.typeId, deviations: overrideCount(asMap(s.published)), hasDraft: !!s.draft })),
  };
}

// ── Afbeeldingen (logo's, sponsorlogo's, sfeerbeelden) ─────────────────────────

export async function listAssets() {
  const rows = await prisma.ticketDesignAsset.findMany({ where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }], include: { versions: { select: { id: true, version: true, width: true, height: true, bytes: true, createdAt: true }, orderBy: { version: "desc" } } } });
  return rows
    .filter((r) => r.currentVersionId)
    .map((r) => {
      const cur = r.versions.find((v) => v.id === r.currentVersionId)!;
      return { id: r.id, name: r.name, kind: r.kind, companyId: r.companyId, url: assetUrl(cur.id), width: cur.width, height: cur.height, version: cur.version, versions: r.versions.length, updatedAt: cur.createdAt };
    });
}

const MAX_UPLOAD = 12 * 1024 * 1024;

async function processImage(buf: Buffer, kind: string): Promise<{ data: Buffer; mime: string; width: number; height: number }> {
  if (buf.length > MAX_UPLOAD) throw new ApiError(400, "Het bestand is groter dan 12 MB.");
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(buf, { density: 300 }).metadata();
  } catch {
    throw new ApiError(400, "Dit bestand is geen bruikbare afbeelding (gebruik PNG, JPG, WebP of SVG).");
  }
  if (!meta.width || !meta.height || !["png", "jpeg", "webp", "svg", "gif", "tiff"].includes(meta.format ?? "")) throw new ApiError(400, "Gebruik een PNG-, JPG-, WebP- of SVG-bestand.");
  // SVG wordt in hoge resolutie omgezet naar PNG (geen scripts uit SVG-bestanden in de Hub).
  const img = sharp(buf, { density: meta.format === "svg" ? 600 : undefined, failOn: "none" }).rotate();
  if (kind === "PHOTO") {
    const out = await img.resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    return { data: out.data, mime: "image/jpeg", width: out.info.width, height: out.info.height };
  }
  // Logo's: transparantie behouden, verhoudingen blijven gelijk.
  const out = await img.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  return { data: out.data, mime: "image/png", width: out.info.width, height: out.info.height };
}

export async function uploadAsset(actor: TicketsActor, input: { file: Buffer; name: string; kind: string; assetId?: string | null; companyId?: string | null }) {
  need(actor, "design:edit");
  const kind = ["LOGO", "SPONSOR", "PHOTO"].includes(input.kind) ? input.kind : "SPONSOR";
  const img = await processImage(input.file, kind);
  const sha = createHash("sha256").update(img.data).digest("hex");
  const result = await prisma.$transaction(async (tx) => {
    let assetId = input.assetId ?? null;
    let version = 1;
    if (assetId) {
      const a = await tx.ticketDesignAsset.findUnique({ where: { id: assetId }, include: { versions: { select: { version: true }, orderBy: { version: "desc" }, take: 1 } } });
      if (!a) throw new ApiError(404, "Afbeelding niet gevonden.");
      version = (a.versions[0]?.version ?? 0) + 1;
    } else {
      const name = input.name.trim().slice(0, 80);
      if (name.length < 2) throw new ApiError(400, "Geef de afbeelding een herkenbare naam.");
      const a = await tx.ticketDesignAsset.create({ data: { name, kind, companyId: input.companyId || null, createdBy: actor.name } });
      assetId = a.id;
    }
    const v = await tx.ticketDesignAssetVersion.create({ data: { assetId, version, mimeType: img.mime, width: img.width, height: img.height, bytes: img.data.length, sha256: sha, data: new Uint8Array(img.data), createdBy: actor.name } });
    await tx.ticketDesignAsset.update({ where: { id: assetId }, data: { currentVersionId: v.id } });
    await tx.ticketAuditEvent.create({ data: ticketAuditData({ action: "design.asset_saved", actor: actorOf(actor), summary: version > 1 ? `Afbeelding vervangen (versie ${version}); uitgegeven tickets houden hun eerdere versie` : "Afbeelding toegevoegd", meta: { assetId, version } }) });
    return { id: assetId, versionId: v.id, version, width: img.width, height: img.height };
  });
  return result;
}

export async function updateAsset(actor: TicketsActor, id: string, raw: { name?: unknown; archived?: unknown }) {
  need(actor, "design:edit");
  const data: Prisma.TicketDesignAssetUpdateInput = {};
  if (typeof raw.name === "string" && raw.name.trim().length >= 2) data.name = raw.name.trim().slice(0, 80);
  if (raw.archived === true) {
    const used = await prisma.ticketDesignScope.findMany({ select: { published: true, draft: true } });
    if (used.some((u) => JSON.stringify([u.published, u.draft]).includes(`"${id}"`))) throw new ApiError(409, "Deze afbeelding wordt nog gebruikt in een ontwerp of concept. Haal hem daar eerst weg.");
    data.archivedAt = new Date();
  }
  await prisma.ticketDesignAsset.update({ where: { id }, data });
  return { ok: true };
}

/** Waar een afbeelding gebruikt wordt (voor de melding bij vervangen). */
export async function assetUsage(id: string) {
  const rows = await prisma.ticketDesignScope.findMany({ select: { scopeKey: true, published: true, draft: true } });
  const refs = rows.filter((r) => JSON.stringify([r.published, r.draft]).includes(`"${id}"`)).map((r) => parseScopeKey(r.scopeKey)).filter((x): x is ScopeRef => !!x);
  const labels = await scopeLabels(refs);
  return refs.map((r) => labels[scopeKeyOf(r)]);
}

// ── Bestaande tickets opnieuw vormgeven ──────────────────────────────────────

/**
 * Past het nu gepubliceerde ontwerp toe op bestaande tickets binnen een niveau. Ticketidentiteit,
 * QR-code, link, toegangsrechten en scanregistraties blijven precies gelijk: alleen de verwijzing
 * naar het vastgelegde ontwerp verandert. Eerst met dryRun de gevolgen bekijken.
 */
export async function reapply(actor: TicketsActor, raw: { scopeKey?: unknown; ticketIds?: unknown; dryRun?: unknown }) {
  need(actor, "design:apply");
  const ref = requireScope(String(raw.scopeKey ?? ""));
  if (ref.level === "set") throw new ApiError(400, "Kies een club-, seizoens- of duelniveau.");
  const ids = Array.isArray(raw.ticketIds) ? raw.ticketIds.map(String).slice(0, 5000) : null;
  const where: Prisma.TicketWhereInput = { status: "ACTIVE", anonymizedAt: null, source: "HHC", ...ticketScopeWhere(ref), ...(ids ? { id: { in: ids } } : {}) };
  const tickets = await prisma.ticket.findMany({ where, take: 5001, select: { id: true, typeId: true, seasonId: true, isSeasonCard: true, validityMode: true, category: true, designSnapshotId: true, links: { select: { event: { select: { id: true, seasonId: true } } } } } });
  if (tickets.length > 5000) throw new ApiError(400, "Meer dan 5000 tickets: kies een kleiner niveau (bijvoorbeeld per duel).");
  const groups = new Map<string, { ctx: DesignContext; ids: string[]; current: (string | null)[] }>();
  for (const t of tickets) {
    const ctx = contextOfTicket(t);
    const k = stableStringify(ctx);
    const g = groups.get(k) ?? { ctx, ids: [], current: [] };
    g.ids.push(t.id);
    g.current.push(t.designSnapshotId);
    groups.set(k, g);
  }
  let changed = 0;
  const plan: { ids: string[]; snapshotId: string }[] = [];
  for (const g of groups.values()) {
    const snap = await snapshotFor(g.ctx);
    const todo = g.ids.filter((_, i) => g.current[i] !== snap.id);
    changed += todo.length;
    if (todo.length) plan.push({ ids: todo, snapshotId: snap.id });
  }
  const summary = { total: tickets.length, changed, unchanged: tickets.length - changed };
  if (raw.dryRun !== false) return { dryRun: true, ...summary };
  const now = new Date();
  for (const p of plan) {
    await prisma.$transaction(async (tx) => {
      // Alleen de ontwerpverwijzing: geen qrVersion, linkVersion, status, links of scans.
      await tx.ticket.updateMany({ where: { id: { in: p.ids } }, data: { designSnapshotId: p.snapshotId, designAppliedAt: now } });
      await tx.ticketAuditEvent.createMany({ data: p.ids.map((id) => ticketAuditData({ action: "ticket.redesigned", actor: actorOf(actor), ticketId: id, meta: { snapshotId: p.snapshotId } })) });
    });
  }
  await ticketAudit({ action: "design.reapplied", actor: actorOf(actor), eventId: ref.eventId ?? null, summary: `${changed} bestaande tickets opnieuw vormgegeven (${scopeKeyOf(ref)})`, meta: { scopeKey: scopeKeyOf(ref), changed, total: tickets.length } });
  return { dryRun: false, ...summary };
}

// Voor de editor: een lege standaardwaarde per veld en formaat (gebruikt bij herstellen).
export const fieldDefaults = () => Object.fromEntries(FIELDS.map((f) => [f.key, { mobile: defaultFor(f, "mobile"), a4: defaultFor(f, "a4") }]));
export { BLOCKS, chainFor };
