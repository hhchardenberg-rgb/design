// Echte tickets: taal van het ticket in de weergave, 'verplaatst'-melding blijft na opnieuw vormgeven,
// geen dubbel woord 'Seizoen', geblokkeerd ticket zonder QR. Wordt overgeslagen zonder TEST_DATABASE_URL.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { TicketsActor } from "../../authz.server";
import { ALL_TICKET_PERMISSIONS } from "../../permissions";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: (typeof import("@/lib/prisma"))["prisma"];
let svc: typeof import("../../tickets.server");
let catalog: typeof import("../../catalog.server");
let ctx: typeof import("../context.server");
let ec: typeof import("../../eventchange.server");

const set = new Set(ALL_TICKET_PERMISSIONS);
const admin: TicketsActor = { id: "weergave-admin", name: "Test weergave", access: { userId: "weergave-admin", isSuperadmin: false, hasAccess: true, permissions: [...ALL_TICKET_PERMISSIONS], can: (p) => set.has(p) } };
const DAY = 86_400_000;
let seasonId: string, typeSingle: string, typeSeason: string;

async function wipe() {
  await db.ticketScan.deleteMany();
  await db.ticketEventLink.deleteMany();
  await db.ticket.deleteMany();
  await db.ticketBatch.deleteMany();
  await db.ticketType.deleteMany();
  await db.ticketEvent.deleteMany();
  await db.ticketZone.deleteMany();
  await db.ticketSeason.deleteMany();
  await db.ticketAuditEvent.deleteMany();
}
const load = (id: string) => db.ticket.findUniqueOrThrow({ where: { id }, include: ctx.ticketInclude });
const issue = async (typeId: string, eventIds: string[], locale: "nl" | "de" | "en", n = 1) => ((await svc.issueTickets(admin, { typeId, eventIds, locale, holders: [{ firstName: `Voor${n}`, lastName: `Achter${n}`, email: `w${n}@test.nl`, phone: "0612345678" }] })) as { ticketIds: string[] }).ticketIds[0];

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../../tickets.server");
  catalog = await import("../../catalog.server");
  ctx = await import("../context.server");
  ec = await import("../../eventchange.server");
  await wipe();
  seasonId = (await catalog.saveSeason(admin, null, { name: "Seizoen 2099/2100", startsOn: new Date().toISOString().slice(0, 10), endsOn: "2100-06-30" }))!.id;
  typeSingle = (await catalog.saveType(admin, null, { name: "Staanplaats", category: "FREE", validityMode: "SINGLE" }))!.id;
  typeSeason = (await catalog.saveType(admin, null, { name: "Seizoenskaart", category: "SEASON", validityMode: "SEASON", seasonId }))!.id;
});

after(async () => {
  if (skip) return;
  await wipe();
  await db.$disconnect();
});

test("de weergave volgt Ticket.locale; ?lang overschrijft", { skip }, async () => {
  const ev = (await catalog.saveEvent(admin, null, { title: "HHC – Taaltest", opponent: "Taaltest", isHome: true, startsAt: new Date(Date.now() + 5 * DAY).toISOString(), seasonId }))!.id;
  const de = await load(await issue(typeSingle, [ev], "de", 1));
  const en = await load(await issue(typeSingle, [ev], "en", 2));
  const vDe = (await ctx.ticketView(de, "mobile")).view;
  const vEn = (await ctx.ticketView(en, "mobile")).view;
  assert.equal(vDe.locale, "de");
  assert.equal(vEn.locale, "en");
  const holder = (v: typeof vDe) => (v.blocks.find((b) => b.id === "holder") as { label: string }).label;
  assert.equal(holder(vDe), "Name");
  const access = (v: typeof vDe) => (v.blocks.find((b) => b.id === "access") as { items: { label: string }[] } | undefined)?.items.map((i) => i.label);
  assert.ok(!access(vDe) || access(vDe)!.every((l) => ["Eingang", "Bereich"].includes(l)));
  assert.match((vDe.blocks.find((b) => b.id === "match") as { lines: string[] }).lines.join("|"), /Beginn/);
  assert.match((vEn.blocks.find((b) => b.id === "match") as { lines: string[] }).lines.join("|"), /Gates open|Start/);
  assert.equal(vDe.statusLabel, "Gültig");
  // ?lang= op de pagina geeft dezelfde ticket een andere taal.
  assert.equal((await ctx.ticketView(de, "mobile", undefined, "en")).view.locale, "en");
  // Het A4-model (pdf) volgt de taal ook.
  assert.equal((await ctx.ticketView(en, "a4")).view.labels.createdAt, "Created on");
});

test("seizoenskaart: geen dubbel 'Seizoen' in kop en geldigheidstekst", { skip }, async () => {
  const t = await load(await issue(typeSeason, [], "nl", 3));
  const { view, facts } = await ctx.ticketView(t, "mobile");
  const m = view.blocks.find((b) => b.id === "match") as { title: string; lines: string[] };
  assert.equal(m.title, "Seizoenskaart 2099/2100");
  assert.doesNotMatch(facts.validityText, /[Ss]eizoen Seizoen/);
  assert.match(facts.validityText, /in seizoen 2099\/2100/);
  const de = await ctx.ticketView(t, "mobile", undefined, "de");
  assert.equal((de.view.blocks.find((b) => b.id === "match") as { title: string }).title, "Saisonkarte 2099/2100");
  assert.match(de.facts.validityText, /^Gültig für alle Heimspiele von HHC Hardenberg in der Saison 2099\/2100$/);
});

test("'verplaatst'-melding blijft staan na opnieuw vormgeven, maar niet bij een ticket dat na de verplaatsing is uitgegeven", { skip }, async () => {
  const start = new Date(Date.now() + 6 * DAY);
  const ev = (await catalog.saveEvent(admin, null, { title: "HHC – Verplaatst", opponent: "Verplaatst", isHome: true, startsAt: start.toISOString(), seasonId }))!.id;
  const id = await issue(typeSingle, [ev], "de", 4);
  assert.equal((await ctx.ticketView(await load(id), "mobile")).facts.notices.length, 0);
  await ec.changeEvent(admin, ev, { action: "MOVE", startsAt: new Date(start.getTime() + 7 * DAY).toISOString(), sendMail: false });
  const notice = async (lang?: string) => (await ctx.ticketView(await load(id), "mobile", undefined, lang)).facts.notices;
  assert.match((await notice())[0], /^Dieses Spiel wurde verlegt/);
  assert.match((await notice("nl"))[0], /^Deze wedstrijd is verplaatst/);
  // Opnieuw vormgeven zet designAppliedAt vooruit; de melding moet blijven.
  await db.ticket.update({ where: { id }, data: { designAppliedAt: new Date(Date.now() + 1000) } });
  assert.equal((await notice()).length, 1, "melding blijft na opnieuw vormgeven");
  // Een ticket dat pas na de verplaatsing is uitgegeven heeft geen melding nodig.
  await new Promise((r) => setTimeout(r, 20));
  const later = await load(await issue(typeSingle, [ev], "nl", 5));
  assert.equal((await ctx.ticketView(later, "mobile")).facts.notices.length, 0);
});

test("afgelast: melding in de taal van het ticket; geblokkeerd ticket toont geen QR", { skip }, async () => {
  const ev = (await catalog.saveEvent(admin, null, { title: "HHC – Afgelast", opponent: "Afgelast", isHome: true, startsAt: new Date(Date.now() + 8 * DAY).toISOString(), seasonId }))!.id;
  const id = await issue(typeSingle, [ev], "en", 6);
  await ec.changeEvent(admin, ev, { action: "CANCEL", sendMail: false });
  const v = await ctx.ticketView(await load(id), "mobile");
  assert.match(v.facts.notices[0], /^This match has been cancelled/);
  assert.equal((v.view.blocks.find((b) => b.id === "match") as { cancelled: boolean }).cancelled, true);
  assert.equal(v.view.labels.cancelled, "Cancelled");

  const id2 = await issue(typeSingle, [(await catalog.saveEvent(admin, null, { title: "HHC – Blok", opponent: "Blok", isHome: true, startsAt: new Date(Date.now() + 9 * DAY).toISOString(), seasonId }))!.id], "de", 7);
  await db.ticket.update({ where: { id: id2 }, data: { status: "BLOCKED" } });
  const b = await ctx.ticketView(await load(id2), "mobile");
  const qr = b.view.blocks.find((x) => x.id === "qr") as { code: string; withheld: boolean };
  assert.equal(qr.withheld, true);
  assert.equal(qr.code, "");
  assert.equal(b.view.inactive?.title, "Dieses Ticket ist gesperrt");
  assert.equal(b.view.statusLabel, "Gesperrt");
  assert.ok(!JSON.stringify(b.view).includes((await load(id2)).publicId), "de view van een geblokkeerd ticket bevat de scancode niet");
});
