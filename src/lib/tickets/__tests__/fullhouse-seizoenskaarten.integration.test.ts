// Fullhouse-seizoenskaarten tegen een echte Postgres (TEST_DATABASE_URL, anders overgeslagen): een kaart op het
// seizoensevenement geeft toegang bij elk thuisduel, met uitsluiten, herintrede, offline-lijst en aanwezigheid.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../authz.server";
import type { ScanActor } from "../scanner-auth.server";
import { ALL_TICKET_PERMISSIONS } from "../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: (typeof import("@/lib/prisma"))["prisma"];
let catalog: typeof import("../catalog.server");
let scan: typeof import("../scan.server");
let sp: typeof import("../seasonpass.server");

const perms = new Set(ALL_TICKET_PERMISSIONS);
const admin: TicketsActor = {
  id: "admin-fh",
  name: "Admin",
  access: {
    userId: "admin-fh",
    isSuperadmin: false,
    hasAccess: true,
    permissions: [...perms] as TicketsActor["access"]["permissions"],
    can: (p) => perms.has(p as never),
  },
};
const steward: ScanActor = {
  kind: "scanner",
  name: "Poort",
  scannerId: null,
  userId: null,
  entranceId: null,
  canOverride: false,
  canSeeStats: false,
};
let n = 0;
const cid = () => `fh-client-${Date.now()}-${n++}`;
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const CODE = "FHSEASON-0001";
const OTHER = "FHSEASON-0002";

let seasonId: string,
  oldSeasonId: string,
  sourceId: string,
  duelId: string,
  hhcDuelId: string,
  excludedId: string,
  oldDuelId: string,
  extId: string;

async function wipe() {
  await db.ticketScan.deleteMany();
  await db.ticketExternalTicket.deleteMany();
  await db.ticketSyncRun.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketBatch.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketSeason.deleteMany();
  await db.ticketAuditEvent.deleteMany();
}

const mkEvent = (data: {
  title: string;
  startsAt: Date;
  seasonId: string | null;
  source?: string;
  externalId?: string;
  excludeSeasonCards?: boolean;
  isHome?: boolean;
}) =>
  db.ticketEvent.create({
    data: {
      status: "ACTIVE",
      endsAt: new Date(data.startsAt.getTime() + 6 * 3600_000),
      allowReentry: true,
      ...data,
    },
  });

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  catalog = await import("../catalog.server");
  scan = await import("../scan.server");
  sp = await import("../seasonpass.server");
  await wipe();
  seasonId = (await catalog.saveSeason(admin, null, {
    name: "FH 2099",
    startsOn: day(-60),
    endsOn: "2099-06-30",
  }))!.id;
  oldSeasonId = (await catalog.saveSeason(admin, null, {
    name: "FH oud",
    startsOn: day(-400),
    endsOn: day(-61),
  }))!.id;
  const t = Date.now();
  extId = `fh-src-${t}`;
  sourceId = (
    await mkEvent({
      title: "Seizoenskaarten 2099",
      startsAt: new Date(t - 50 * 86_400_000),
      seasonId,
      source: "FULLHOUSE",
      externalId: extId,
    })
  ).id;
  duelId = (
    await mkEvent({
      title: "FH – Thuisduel",
      startsAt: new Date(t - 3600_000),
      seasonId,
      source: "FULLHOUSE",
      externalId: `fh-duel-${t}`,
    })
  ).id;
  hhcDuelId = (
    await mkEvent({
      title: "FH – Eigen duel",
      startsAt: new Date(t - 7200_000),
      seasonId,
    })
  ).id;
  excludedId = (
    await mkEvent({
      title: "FH – Beker",
      startsAt: new Date(t - 1800_000),
      seasonId,
      excludeSeasonCards: true,
    })
  ).id;
  oldDuelId = (
    await mkEvent({
      title: "FH – Vorig seizoen",
      startsAt: new Date(t - 100 * 86_400_000),
      seasonId: oldSeasonId,
    })
  ).id;
  await db.ticketExternalTicket.createMany({
    data: [
      {
        eventExtId: extId,
        externalId: "x1",
        codeHash: scan.codeHash(CODE),
        status: "VALID",
        ticketName: "Seizoenskaart met tribuneplaats",
        holderLabel: "A. Jansen",
        area: "Tribune",
        soldAt: new Date(t - 40 * 86_400_000),
      },
      {
        eventExtId: extId,
        externalId: "x2",
        codeHash: scan.codeHash(OTHER),
        status: "INVALID",
        ticketName: "Seizoenskaart zonder tribuneplaats",
        holderLabel: "B. Bakker",
      },
    ],
  });
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

const doScan = (eventId: string, code: string, eventIds?: string[]) =>
  scan.processScan(steward, {
    eventId,
    code,
    clientId: cid(),
    ...(eventIds ? { eventIds } : {}),
  });

test(
  "Fullhouse-seizoenskaart: binnen bij een Fullhouse-duel en bij een eigen duel, herintrede daarna",
  { skip },
  async () => {
    const a = await doScan(duelId, CODE);
    assert.equal(a.result, "VALID");
    assert.equal(a.reentry, false);
    assert.equal(a.label, "A. Jansen · Seizoenskaart met tribuneplaats");
    assert.equal(a.zone, "Tribune");
    const b = await doScan(duelId, CODE);
    assert.equal(b.result, "VALID");
    assert.equal(b.reentry, true);
    assert.equal((await doScan(hhcDuelId, CODE)).result, "VALID");
  },
);

test(
  "uitgesloten duel, ander seizoen en geannuleerde kaart worden geweigerd met een duidelijke reden",
  { skip },
  async () => {
    const ex = await doScan(excludedId, CODE);
    assert.equal(ex.reason, "WRONG_EVENT");
    assert.equal(ex.detail, "Seizoenskaarten gelden niet voor dit duel.");
    const old = await doScan(oldDuelId, CODE);
    assert.equal(old.reason, "WRONG_EVENT");
    assert.match(old.detail ?? "", /FH 2099/);
    const cancelled = await doScan(duelId, OTHER);
    assert.equal(cancelled.result, "INVALID");
    assert.equal(cancelled.reason, "CANCELLED");
    assert.equal((await doScan(duelId, "ONBEKEND-123")).reason, "NOT_FOUND");
  },
);

test(
  "meerdere duels gekozen: de scan komt bij het duel waar de kaart voor geldt",
  { skip },
  async () => {
    const r = await doScan(oldDuelId, CODE, [oldDuelId, hhcDuelId]);
    assert.equal(r.eventId, hhcDuelId);
    assert.equal(r.result, "VALID");
  },
);

test(
  "offline-lijst van een duel bevat de Fullhouse-seizoenskaarten met herintrede",
  { skip },
  async () => {
    const c = await scan.offlineCache(duelId);
    const hit = c.fullhouse.find((x) => x.h === scan.codeHash(CODE));
    assert.ok(hit);
    assert.equal(hit.r, true);
    assert.equal(
      c.fullhouse.some((x) => x.h === scan.codeHash(OTHER)),
      false,
    );
    assert.equal((await scan.offlineCache(excludedId)).fullhouse.length, 0);
  },
);

test(
  "aanwezigheid per duel, per houder en als Excel; het seizoensevenement telt niet als duel",
  { skip },
  async () => {
    const ev = await sp.eventAttendance(admin, duelId);
    const row = ev.rows.find((r) => r.source === "FULLHOUSE");
    assert.ok(row);
    assert.equal(row.name, "A. Jansen");
    assert.equal(row.state, "ATTENDED");
    assert.equal(row.reentries, 1);
    assert.equal(
      ev.rows.some((r) => r.name === "B. Bakker"),
      false,
    );

    const ov = await sp.seasonPassOverview(admin, { seasonId });
    const h = ov.rows.find((r) => r.source === "FULLHOUSE")!;
    assert.equal(h.attended, 2);
    assert.equal(
      h.eligible,
      2,
      "thuisduels zonder beker en zonder het seizoensevenement zelf",
    );
    assert.equal(ov.summary?.fullhouse, 1);

    const byEvent = await sp.seasonAttendanceByEvent(admin, { seasonId });
    assert.equal(
      byEvent.events.some((e) => e.id === sourceId),
      false,
    );

    const detail = await sp.seasonPassDetail(admin, h.id);
    assert.equal(detail.source, "FULLHOUSE");
    assert.equal(detail.games.find((g) => g.id === duelId)?.scans, 2);
    assert.equal(
      detail.games.find((g) => g.id === excludedId)?.state,
      "EXCLUDED",
    );

    const x = await sp.seasonAttendanceExport(admin, seasonId);
    assert.ok(x.body.byteLength > 0);
  },
);

test(
  "beheerder zet 'geen seizoenskaarten' op het evenement: kaarten geven geen toegang meer",
  { skip },
  async () => {
    await catalog.saveFullhouseEventSettings(admin, sourceId, {
      seasonCardSource: false,
    });
    assert.equal((await doScan(duelId, CODE)).reason, "NOT_FOUND");
    await catalog.saveFullhouseEventSettings(admin, sourceId, {
      seasonCardSource: null,
    });
    assert.equal((await doScan(duelId, CODE)).result, "VALID");
  },
);
