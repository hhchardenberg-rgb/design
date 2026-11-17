// Ticketweergave in NL/DE/EN, geblokkeerde tickets en lange namen in de A4-pdf (zonder database).
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { buildView, type TicketFacts, type TicketView } from "../view";
import { resolveFormat } from "../resolve";
import { DESIGN_TEXT_TRANSLATIONS, TEXTS, type Locale } from "../../i18n";
import { DEFAULT_TERMS, FIELDS } from "../fields";
import { BUILTIN_SETS } from "../builtin";

const CODE = "HHC1.0MRW20S4BZ2E1CCK.1.Fds3_TUYo7s9KR1WgfPzPg";

const facts = (p: Partial<TicketFacts> = {}): TicketFacts =>
  ({
    sample: false, locale: "nl", kind: "match", firstName: "Jan", lastName: "de Vries", company: null, typeName: "Staanplaats", typeColor: null,
    ticketNumber: "0MRW-20S4-BZ2E-1CCK", qrCode: CODE, seasonName: "Seizoen 2026/2027", validityText: "Geldig voor deze wedstrijd",
    // Zaterdag 21 november 2026 14:30 (Amsterdam)
    event: { title: "HHC Hardenberg – Katwijk", opponent: "Katwijk", isHome: true, competition: "Competitie", startsAt: "2026-11-21T13:30:00Z", location: null, status: "ACTIVE", opponentLogoUrl: null },
    events: [], zoneName: "Hoofdtribune", entranceName: "Ingang Noord", notices: [], statusLabel: "Actief", status: "ACTIVE", usable: true,
    ...p,
  }) as TicketFacts;

const view = (locale: Locale, p: Partial<TicketFacts> = {}, format: "mobile" | "a4" = "mobile") => buildView(facts({ locale, ...p }), resolveFormat([], format), format, {});
const blockOf = <T extends string>(v: TicketView, id: T) => v.blocks.find((b) => b.id === id) as never as Record<string, unknown>;

test("elke vertaalde standaardtekst bestaat echt als standaard van een veld of basisontwerp", () => {
  const known = new Set<string>();
  for (const f of FIELDS) {
    if (typeof f.default === "string") known.add(f.default);
    if (f.fallback) known.add(f.fallback);
  }
  for (const set of BUILTIN_SETS) for (const layer of Object.values(set.overrides)) for (const x of Object.values(layer ?? {})) if (x && typeof x === "object" && "v" in x && typeof (x as { v: unknown }).v === "string") known.add((x as { v: string }).v);
  known.add(DEFAULT_TERMS);
  for (const nl of Object.keys(DESIGN_TEXT_TRANSLATIONS)) assert.ok(known.has(nl), `onbekende standaardtekst: ${nl}`);
  // Omgekeerd: alle zichtbare standaardlabels hebben een vertaling.
  for (const nl of ["Naam", "Ingang", "Vak", "Toon deze code bij de ingang", "Praktische informatie", "Aanvang {{aanvangstijd}}", "Poorten open {{poorten_open}}", "Seizoenskaart {{seizoen}}", DEFAULT_TERMS]) assert.ok(DESIGN_TEXT_TRANSLATIONS[nl], nl);
});

test("Duits: labels, weekdag, regels en bijschriften in het Duits; datum blijft dd/mm/jjjj", () => {
  const v = view("de");
  assert.equal(v.locale, "de");
  const match = blockOf(v, "match") as { lines: string[] };
  assert.deepEqual(match.lines, ["Samstag 21/11/2026", "Beginn 14:30", "Einlass ab 13:30"]);
  assert.equal((blockOf(v, "holder") as { label: string }).label, "Name");
  assert.deepEqual((blockOf(v, "access") as { items: { label: string }[] }).items.map((i) => i.label), ["Eingang", "Bereich"]);
  assert.equal((blockOf(v, "qr") as { caption: string }).caption, "Zeige diesen Code am Eingang");
  const info = blockOf(v, "info") as { title: string; items: { label: string; text: string }[] };
  assert.equal(info.title, "Praktische Informationen");
  assert.equal(info.items[0].label, "Einlass");
  assert.match(info.items[0].text, /^Komm rechtzeitig: der Einlass beginnt um 13:30/);
  assert.match((blockOf(v, "footer") as { terms: string }).terms, /^Dieses Ticket ist personengebunden/);
  assert.equal(v.labels.ticketNumber, "Ticketnummer");
});

test("Engels: labels, weekdag en regels in het Engels", () => {
  const v = view("en");
  const match = blockOf(v, "match") as { lines: string[] };
  assert.deepEqual(match.lines, ["Saturday 21/11/2026", "Start 14:30", "Gates open 13:30"]);
  assert.equal((blockOf(v, "holder") as { label: string }).label, "Name");
  assert.deepEqual((blockOf(v, "access") as { items: { label: string }[] }).items.map((i) => i.label), ["Entrance", "Section"]);
  assert.equal((blockOf(v, "qr") as { caption: string }).caption, "Show this code at the entrance");
  assert.equal(v.labels.qrAria, "QR code of your ticket");
});

test("Nederlands blijft ongewijzigd", () => {
  const v = view("nl");
  assert.deepEqual((blockOf(v, "match") as { lines: string[] }).lines, ["zaterdag 21/11/2026", "Aanvang 14:30", "Poorten open 13:30"]);
  assert.equal((blockOf(v, "holder") as { label: string }).label, "Naam");
  assert.equal((blockOf(v, "qr") as { caption: string }).caption, "Toon deze code bij de ingang");
});

test("door de beheerder ingevoerde teksten worden niet vertaald", () => {
  const custom = resolveFormat([{ level: "club", scopeKey: "club", label: "club", overrides: { shared: { "holder.label": { m: "value", v: "Naam bezoeker" }, "qr.caption": { m: "value", v: "Laat dit zien" }, "access.zoneLabel": { m: "value", v: "Tribune" } } } }], "mobile");
  const v = buildView(facts({ locale: "de" }), custom, "mobile", {});
  assert.equal((blockOf(v, "holder") as { label: string }).label, "Naam bezoeker");
  assert.equal((blockOf(v, "qr") as { caption: string }).caption, "Laat dit zien");
  assert.deepEqual((blockOf(v, "access") as { items: { label: string }[] }).items.map((i) => i.label), ["Eingang", "Tribune"]);
});

test("seizoenskaart: geen dubbel woord 'Seizoen' in de kop, in alle talen", () => {
  const titles = (["nl", "de", "en"] as const).map((l) => (blockOf(view(l, { kind: "season", event: null, events: [] }), "match") as { title: string }).title);
  assert.deepEqual(titles, ["Seizoenskaart 2026/2027", "Saisonkarte 2026/2027", "Season pass 2026/2027"]);
  // Een seizoensnaam zonder het woord wordt niet aangepast.
  assert.equal((blockOf(view("nl", { kind: "season", event: null, events: [], seasonName: "2026/2027" }), "match") as { title: string }).title, "Seizoenskaart 2026/2027");
});

test("meerdere wedstrijden en afgelast: titel en melding in de taal van het ticket", () => {
  const multi = view("en", { event: null, events: [{ title: "A", startsAt: "2026-11-21T13:30:00Z" }, { title: "B", startsAt: "2026-11-28T13:30:00Z" }] });
  assert.equal((blockOf(multi, "match") as { title: string }).title, "2 matches");
  assert.equal(TEXTS.de.v.cancelled, "Abgesagt");
  assert.equal(view("de").labels.cancelled, "Abgesagt");
});

test("geblokkeerd ticket op mobiel: geen echte QR-code in de view, uitleg in de taal van het ticket", () => {
  for (const [locale, title] of [["nl", "Dit ticket is geblokkeerd"], ["de", "Dieses Ticket ist gesperrt"], ["en", "This ticket has been blocked"]] as const) {
    const v = view(locale, { usable: false, status: "BLOCKED", statusLabel: "x" });
    const qr = blockOf(v, "qr") as { code: string; withheld: boolean; caption: string | null };
    assert.equal(qr.withheld, true);
    assert.equal(qr.code, "", "de scancode zit niet in de view van een geblokkeerd ticket");
    assert.equal(qr.caption, null);
    assert.equal(v.inactive?.title, title);
    assert.match(v.inactive!.body, /HHC Hardenberg/);
  }
  // De A4-weergave (alleen voor bruikbare tickets) en voorbeelden houden de code.
  assert.equal((blockOf(view("nl", { usable: false, status: "BLOCKED" }, "a4"), "qr") as { code: string }).code, CODE);
  assert.equal((blockOf(view("nl", { sample: true, usable: false }), "qr") as { code: string }).code, CODE);
});

test("mobiele pagina van een geblokkeerd ticket: geen QR, geen knoppen, wel uitleg (DE)", async () => {
  (Module as unknown as { _extensions: Record<string, () => void> })._extensions[".css"] = () => {};
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { MobileTicket } = await import("@/components/tickets/design/mobile-ticket");
  const { textsFor } = await import("../../i18n");
  const v = view("de", { usable: false, status: "CANCELLED", statusLabel: "Storniert" });
  const html = renderToString(createElement(MobileTicket, { view: v, labels: { ...textsFor("de").ui, personalNote: textsFor("de").personalNote }, pdfHref: null, offline: true }));
  assert.match(html, /Dieses Ticket wurde storniert/);
  assert.match(html, /Kundenservice/);
  assert.doesNotMatch(html, /<svg[^>]*role="img"/, "geen QR-svg");
  assert.doesNotMatch(html, /QR-Code zeigen|Auf diesem Gerät speichern|A4-Ticket|Screenshot/);
  // Een geldig Duits ticket heeft ze wel, en de aria-label volgt de taal.
  const ok = renderToString(createElement(MobileTicket, { view: view("de"), labels: { ...textsFor("de").ui, personalNote: textsFor("de").personalNote }, pdfHref: "/t/x/pdf", offline: true }));
  assert.match(ok, /QR-Code zeigen/);
  assert.match(ok, /aria-label="QR-Code deines Tickets"/);
  assert.match(ok, /NAME|Name/);
});

test("A4-pdf: lange namen worden niet afgekapt maar lopen over meer regels, binnen de marges", async () => {
  const { layoutForView } = await import("../pdf.server");
  const { A4_W } = await import("../a4-layout");
  const long = { firstName: "Maximiliaan Alexander Theodorus Bartholomeus", lastName: "van den Hoogenband-Vermeulen de Bruijn-Oosterhuis", company: "Voorbeeldbedrijf Installatietechniek en Onderhoud Oost-Nederland BV" };
  const v = buildView(facts({ ...long, zoneName: "Business Seats Hoofdtribune West Vak 12 Rij 3" }), { ...resolveFormat([], "a4"), "holder.showCompany": { state: "value", value: true, origin: { level: "default", scopeKey: "default", label: "" }, overridden: [] } } as never, "a4", {});
  const layout = await layoutForView(v, null);
  const texts = layout.boxes.filter((b) => b.t === "text").map((b) => (b as { text: string }).text);
  assert.ok(!texts.some((t) => t.includes("…")), "geen afkapping");
  const joined = texts.join(" ");
  for (const word of ["Maximiliaan", "Alexander", "Theodorus", "Bartholomeus", "Hoogenband-Vermeulen", "Bruijn-Oosterhuis"]) assert.ok(joined.includes(word), `${word} staat in de pdf`);
  for (const b of layout.boxes) if (b.t === "text") assert.ok(b.x >= 28 && b.x < A4_W - 28, "binnen de marges");
  assert.ok(layout.spare >= 0, "past op één pagina");
});

test("A4-pdf in het Duits: voettekst en datum volgen de taal; QR blijft leesbaar", async () => {
  const { layoutForView, renderPdf } = await import("../pdf.server");
  const v = view("de", {}, "a4");
  const layout = await layoutForView(v, "17/11/2026 09:00");
  const texts = layout.boxes.filter((b) => b.t === "text").map((b) => (b as { text: string }).text).join("\n");
  assert.match(texts, /Ticketnummer 0MRW/);
  assert.match(texts, /Erstellt am 17\/11\/2026 09:00/);
  assert.match(texts, /Samstag 21\/11\/2026/);
  assert.match(texts, /Einlass ab 13:30/);
  assert.match(texts, /Zeige diesen Code am Eingang/);
  const bytes = await renderPdf([layout], async () => null, { title: "t" });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const jsQR = (await import("jsqr")).default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise;
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 3 });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const c = canvas.getContext("2d");
  c.fillStyle = "#FFFFFF";
  c.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: c as unknown as CanvasRenderingContext2D, viewport: vp, canvas: canvas as unknown as HTMLCanvasElement }).promise;
  const img = c.getImageData(0, 0, canvas.width, canvas.height);
  assert.equal(jsQR(img.data, img.width, img.height)?.data, CODE);
  await pdf.cleanup();
});

test("kapotte %-codering in een /t/-link: nette foutpagina in drie talen in plaats van een kale 400", async () => {
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const ErrorPage = (await import("@/pages/_error")).default;
  const html = renderToString(createElement(ErrorPage, { statusCode: 400 }));
  assert.match(html, /Deze ticketlink werkt niet meer/);
  assert.match(html, /Dieser Ticket-Link funktioniert nicht mehr/);
  assert.match(html, /This ticket link no longer works/);
  assert.doesNotMatch(renderToString(createElement(ErrorPage, { statusCode: 500 })), /ticketlink/);
});
