import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAll, resolveFormat, scopeKeyOf, parseScopeKey, chainFor, setOverride, resetGroup, diffOverrides, type LayerInput, type OverrideMap, type SetLayer } from "../resolve";
import { buildView, type TicketFacts } from "../view";
import { sanitizeOverrides, unsupportedOverrides } from "../validate";
import { renderText, textIssues } from "../dynamic";
import { BUILTIN_SETS } from "../builtin";

const v = (x: unknown) => ({ m: "value" as const, v: x });
const L = (level: LayerInput["level"], overrides: OverrideMap, key = level): LayerInput => ({ level, scopeKey: key, label: key, overrides });

const sets: Record<string, SetLayer> = { std: { id: "std", name: "Standaard", overrides: { shared: { "color.accent": v("#FF6F00") } } } };

const facts = (p: Partial<TicketFacts> = {}): TicketFacts => ({
  sample: true,
  kind: "match",
  firstName: "Jan",
  lastName: "de Vries",
  company: null,
  typeName: "Vrijkaart",
  typeColor: null,
  ticketNumber: "ABCD-EFGH",
  qrCode: "HHC-VOORBEELD-GEEN-TOEGANG",
  seasonName: "2026/2027",
  validityText: "Geldig voor alle thuiswedstrijden",
  event: { title: "HHC – Voorbeeld", opponent: "Voorbeeld", isHome: true, competition: null, startsAt: "2026-11-21T13:30:00Z", location: null, status: "ACTIVE", opponentLogoUrl: null },
  events: [],
  zoneName: null,
  entranceName: null,
  notices: [],
  statusLabel: "geldig",
  usable: true,
  ...p,
});

test("scopesleutels gaan heen en terug", () => {
  for (const r of [{ level: "club" }, { level: "season", seasonId: "s1" }, { level: "eventType", eventId: "e1", typeId: "t1" }, { level: "set", setId: "x" }] as const) {
    assert.deepEqual(parseScopeKey(scopeKeyOf(r)), r);
  }
  assert.equal(parseScopeKey("event:../x"), null);
  assert.deepEqual(chainFor({ typeId: "t", seasonId: "s", eventId: "e" }).map(scopeKeyOf), ["club", "club:type:t", "season:s", "season:s:type:t", "event:e", "event:e:type:t"]);
  assert.deepEqual(chainFor({ typeId: "t", seasonId: "s" }).map(scopeKeyOf), ["club", "club:type:t", "season:s", "season:s:type:t"]);
});

test("1. een seizoenstandaard geldt automatisch voor een nieuw duel zonder eigen instellingen", () => {
  const season = L("season", { shared: { "color.accent": v("#123456"), "sponsors.items": v(["A"]) } });
  const r = resolveFormat([L("club", {}), season, L("event", {})], "mobile");
  assert.equal(r["color.accent"].value, "#123456");
  assert.equal(r["color.accent"].origin.level, "season");
  assert.deepEqual(r["sponsors.items"].value, ["A"]);
});

test("2-4. alleen de sponsor van een duel wijzigen; seizoenslettertype werkt door; herstellen toont de actuele seizoenswaarde", () => {
  let season: OverrideMap = { shared: { "font.heading": v("din"), "sponsors.items": v(["A"]), "color.accent": v("#FF6F00") } };
  let event: OverrideMap = { shared: { "sponsors.items": v(["B"]) } };
  const run = () => resolveFormat([L("season", season), L("event", event)], "a4");
  let r = run();
  assert.deepEqual(r["sponsors.items"].value, ["B"]);
  assert.equal(r["sponsors.items"].origin.level, "event");
  assert.equal(r["font.heading"].origin.level, "season");
  // 3: seizoen krijgt een ander lettertype; het duel volgt, sponsor B blijft.
  season = setOverride(season, "shared", "font.heading", v("inter"));
  r = run();
  assert.equal(r["font.heading"].value, "inter");
  assert.deepEqual(r["sponsors.items"].value, ["B"]);
  // 4: duel terug op overerven: de actuele seizoenssponsor verschijnt (ook na een latere seizoenswijziging).
  season = setOverride(season, "shared", "sponsors.items", v(["C"]));
  event = setOverride(event, "shared", "sponsors.items", undefined);
  r = run();
  assert.deepEqual(r["sponsors.items"].value, ["C"]);
  assert.equal(r["sponsors.items"].origin.level, "season");
});

test("5. Bewust leeg, Niet tonen en Overerven geven verschillende resultaten", () => {
  const season = L("season", { shared: { "hero.image": v("foto1"), "info.route": v("Via de A34") } });
  const assets = { foto1: { assetId: "foto1", versionId: "v1", url: "/x", width: 2000, height: 1000, name: "Foto" } };
  const view = (event: OverrideMap) => buildView(facts(), resolveFormat([season, L("event", event)], "mobile"), "mobile", assets);
  const inherit = view({});
  const empty = view({ shared: { "hero.image": { m: "empty" }, "info.route": { m: "empty" } } });
  const hidden = view({ shared: { "hero.image": { m: "hidden" } } });
  const hero = (x: ReturnType<typeof view>) => x.blocks.find((b) => b.id === "hero");
  const info = (x: ReturnType<typeof view>) => x.blocks.find((b) => b.id === "info");
  assert.equal((hero(inherit) as { image: unknown }).image !== null, true, "overerven: foto van het seizoen");
  assert.equal((hero(empty) as { image: unknown }).image, null, "bewust leeg: vlak zonder foto");
  assert.equal(hero(hidden), undefined, "niet tonen: geen vlak");
  assert.ok((info(inherit) as { items: { label: string }[] }).items.some((i) => i.label === "Route en parkeren"));
  assert.ok(!(info(empty) as { items: { label: string }[] }).items.some((i) => i.label === "Route en parkeren"), "bewust leeg: geen route, ook geen vervangende tekst");
  assert.ok(info(empty), "het blok zelf blijft (entree staat er nog)");
});

test("leeg, uit en 0 zijn gewone eigen waarden, geen overerven", () => {
  const r = resolveFormat([L("season", { shared: { "holder.label": v("Houder"), "holder.showCompany": v(true) } }), L("event", { shared: { "holder.label": v(""), "holder.showCompany": v(false) } })], "mobile");
  assert.equal(r["holder.label"].value, "");
  assert.equal(r["holder.label"].origin.level, "event");
  assert.equal(r["holder.showCompany"].value, false);
  assert.equal(r["holder.showCompany"].origin.level, "event");
});

test("6. voorrang: per niveau eerst gedeeld, dan formaat; een duelinstelling voor beide formaten vervangt een geërfde formaatafwijking", () => {
  const layers = [
    L("club", { shared: { "color.accent": v("#000001") } }),
    L("clubType", { a4: { "color.accent": v("#000002") } }),
    L("season", {}),
    L("seasonType", { mobile: { "color.accent": v("#000004") } }),
    L("event", { shared: { "color.accent": v("#000005") } }),
    L("eventType", {}),
  ];
  assert.equal(resolveFormat(layers, "mobile")["color.accent"].value, "#000005");
  assert.equal(resolveFormat(layers, "a4")["color.accent"].value, "#000005");
  // Zonder duelinstelling: mobiel krijgt de seizoen-per-type-afwijking, A4 die van club per type.
  const noEvent = layers.slice(0, 4);
  assert.equal(resolveFormat(noEvent, "mobile")["color.accent"].value, "#000004");
  assert.equal(resolveFormat(noEvent, "a4")["color.accent"].value, "#000002");
  // Binnen één niveau wint de formaatafwijking van de gedeelde waarde.
  const same = [L("event", { shared: { "color.accent": v("#000010") }, a4: { "color.accent": v("#000011") } })];
  assert.equal(resolveFormat(same, "mobile")["color.accent"].value, "#000010");
  assert.equal(resolveFormat(same, "a4")["color.accent"].value, "#000011");
  // Een algemene duelinstelling wint van seizoen per tickettype; duel per tickettype kan daar weer bovenop.
  const withType = [...layers.slice(0, 5), L("eventType", { mobile: { "color.accent": v("#000006") } })];
  assert.equal(resolveFormat(withType, "mobile")["color.accent"].value, "#000006");
  assert.equal(resolveFormat(withType, "mobile")["color.accent"].overridden.length, 4, "standaard, club, seizoen per type (mobiel), duel");
});

test("ontwerpset kiezen per soort ticket; zonder keuze de basisset", () => {
  const all = { ...sets, alt: { id: "alt", name: "Beker", overrides: { shared: { "color.accent": v("#00AA00") } } } };
  const base = resolveAll({ kind: "match", chain: [L("club", {})], sets: all, fallbackSetId: "std" });
  assert.equal(base.setId, "std");
  assert.equal(base.mobile["color.accent"].value, "#FF6F00");
  const cup = resolveAll({ kind: "match", chain: [L("club", {}), L("event", { shared: { "design.match": v("alt") } })], sets: all, fallbackSetId: "std" });
  assert.equal(cup.setId, "alt");
  assert.equal(cup.a4["color.accent"].value, "#00AA00");
  // Een seizoenskaart volgt haar eigen veld.
  const card = resolveAll({ kind: "season", chain: [L("event", { shared: { "design.match": v("alt") } })], sets: all, fallbackSetId: "std" });
  assert.equal(card.setId, "std");
});

test("7. mobiel en A4 kunnen anders zijn ingedeeld met dezelfde feitelijke gegevens", () => {
  const layers = [L("club", { mobile: { "layout.align": v("center") }, a4: { "a4.columns": v("1") } })];
  const f = facts();
  const m = buildView(f, resolveFormat(layers, "mobile"), "mobile", {});
  const a = buildView(f, resolveFormat(layers, "a4"), "a4", {});
  assert.equal(m.style.align, "center");
  assert.equal(a.style.align, "left");
  assert.equal(a.a4.columns, 1);
  const pickFacts = (x: typeof m) => JSON.stringify(x.blocks.filter((b) => ["match", "holder", "qr", "type"].includes(b.id)).sort((p, q) => p.id.localeCompare(q.id)));
  assert.equal(pickFacts(m), pickFacts(a));
});

test("ontbrekende gegevens: regel vervalt, vervangende tekst of terugval; nooit een onverwerkte variabele", () => {
  assert.equal(renderText("Ingang {{ingang}}\nTot ziens", {}), "Tot ziens");
  assert.equal(renderText("Ingang {{ingang}}", {}, { ingang: "zie bord" }), "Ingang zie bord");
  assert.equal(renderText("Hallo {{onbekend}}", {}), null);
  assert.equal(renderText("Hallo {{naam", { naam: "x" }), "Hallo naam");
  assert.deepEqual(textIssues("{{naam}} {{bestaatniet}}"), ["Onbekend gegeven {{bestaatniet}}."]);
  const view = buildView(facts({ event: { ...facts().event!, opponent: null } }), resolveFormat([], "mobile"), "mobile", {});
  const match = view.blocks.find((b) => b.id === "match") as { title: string };
  assert.equal(match.title, "HHC – Voorbeeld", "kop valt terug op de wedstrijdtitel");
  assert.ok(!JSON.stringify(view).includes("{{"));
});

test("17. een seizoenskaart zonder duelcontext toont geen wedstrijdinformatie", () => {
  const f = facts({ kind: "season", event: null });
  const view = buildView(f, resolveFormat([L("season", { shared: { "match.title": v("Extra duel {{uitclub}}") } })], "mobile"), "mobile", {});
  const m = view.blocks.find((b) => b.id === "match") as { mode: string; title: string; lines: string[] };
  assert.equal(m.mode, "season");
  assert.equal(m.title, "Seizoenskaart 2026/2027");
  assert.deepEqual(m.lines, ["Geldig voor alle thuiswedstrijden"]);
  assert.ok(!JSON.stringify(view).match(/Aanvang|Poorten|Extra duel/));
});

test("8. lange namen en ontbrekende zitplaatsgegevens laten geen lege labels achter", () => {
  const view = buildView(facts({ firstName: "Maximiliaan Alexander", lastName: "van den Hoogenband-Vermeulen", zoneName: null, entranceName: null }), resolveFormat([], "a4"), "a4", {});
  assert.equal(view.blocks.find((b) => b.id === "access"), undefined);
  assert.equal((view.blocks.find((b) => b.id === "holder") as { name: string }).name, "Maximiliaan Alexander van den Hoogenband-Vermeulen");
});

test("server weigert onveilige of onbekende instellingen", () => {
  const { map, errors } = sanitizeOverrides(
    {
      shared: { "qr.a4Size": v(20), "color.accent": v("oranje"), "match.title": v("{{hack}}"), "layout.blocks": v([{ id: "qr", visible: false }]), onbekend: v(1), "holder.label": { m: "hidden" }, "design.match": v("x") },
      mobile: { "a4.margin": v(12) },
      a4: { "qr.a4Size": v(50) },
    },
    { isSet: true },
  );
  assert.equal(errors.length, 8);
  assert.deepEqual(map, { a4: { "qr.a4Size": v(50) } });
});

test("afwijkingen die in de gekozen set niet zichtbaar worden, worden gemeld", () => {
  const set = { shared: { "layout.blocks": v([{ id: "sponsors", visible: false }]) } };
  const scope = { shared: { "sponsors.items": v(["B"]) } };
  const layers = [L("set", set), L("event", scope)];
  const issues = unsupportedOverrides(scope, { mobile: resolveFormat(layers, "mobile"), a4: resolveFormat(layers, "a4") });
  assert.equal(issues.length, 2);
});

test("herstellen van een onderdeel laat zien wat verdwijnt; verschillen worden per veld bepaald", () => {
  const map: OverrideMap = { shared: { "sponsors.items": v(["B"]), "sponsors.title": v("x"), "color.accent": v("#000000") }, a4: { "sponsors.size": v("l") } };
  const r = resetGroup(map, "sponsoren");
  assert.equal(r.removed.length, 3);
  assert.deepEqual(r.map, { shared: { "color.accent": v("#000000") } });
  assert.equal(diffOverrides(map, r.map).length, 3);
});

test("de ingebouwde ontwerpen zijn geldig", () => {
  for (const s of BUILTIN_SETS) assert.deepEqual(sanitizeOverrides(s.overrides, { isSet: true }).errors, [], s.name);
});
