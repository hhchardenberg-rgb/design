import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TICKET_FONTS, headingFontKey, webFontsFor } from "../fonts";

// De huisstijllettertypen moeten echt in public/ staan: anders valt de pdf om en toont de
// ticketpagina Arial.
test("alle lettertypebestanden van het ticketontwerp bestaan (browser en pdf)", () => {
  for (const [key, f] of Object.entries(TICKET_FONTS)) {
    assert.ok(fs.existsSync(path.join(process.cwd(), "public", f.web)), `${key}: ${f.web} ontbreekt`);
    assert.ok(fs.existsSync(path.join(process.cwd(), "public", f.pdf)), `${key}: ${f.pdf} ontbreekt`);
  }
});

test("ticket-fonts.css declareert precies dezelfde bestanden en gewichten", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/components/tickets/design/ticket-fonts.css"), "utf8");
  for (const f of Object.values(TICKET_FONTS)) {
    const re = new RegExp(`font-family: "${f.family}"; src: url\\("${f.web.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\)[^}]*font-weight: ${f.weight};`);
    assert.match(css, re, `${f.family} ${f.weight} ontbreekt in ticket-fonts.css`);
  }
});

test("kopgewichten: DIN Medium/Bold/Black", () => {
  assert.equal(TICKET_FONTS[headingFontKey("din", "medium")].weight, 500);
  assert.equal(TICKET_FONTS[headingFontKey("din", "bold")].weight, 700);
  assert.equal(TICKET_FONTS[headingFontKey("din", "black")].weight, 900);
});

test("standaardticket laadt DIN Black en Inter", () => {
  const files = webFontsFor({ headingFont: "din", headingWeight: "black", bodyFont: "inter" });
  assert.ok(files.includes("/fonts/ff-din/FF_DIN_Black.otf"));
  assert.ok(files.includes("/fonts/inter/inter-400.woff2"));
  assert.ok(files.includes("/fonts/inter/inter-700.woff2"));
});

test("de A4-pdf sluit FF DIN en Inter in", async () => {
  const { buildView } = await import("../view");
  const { resolveFormat } = await import("../resolve");
  const { layoutForView, renderPdf } = await import("../pdf.server");
  const view = buildView(
    {
      sample: true, kind: "match", firstName: "Jan", lastName: "de Vries", company: null, typeName: "Vrijkaart", typeColor: null,
      ticketNumber: "ABCD-EFGH", qrCode: "HHC-VOORBEELD-GEEN-TOEGANG", seasonName: "2026/2027", validityText: "Geldig voor deze wedstrijd",
      event: { title: "HHC – Voorbeeld", opponent: "Voorbeeld", isHome: true, competition: null, startsAt: "2026-11-21T13:30:00Z", location: null, status: "ACTIVE", opponentLogoUrl: null },
      events: [], zoneName: null, entranceName: null, notices: [], statusLabel: "geldig", usable: true,
    },
    resolveFormat([], "a4"),
    "a4",
    {},
  );
  const layout = await layoutForView(view, null);
  const bytes = Buffer.from(await renderPdf([layout], async () => null, { title: "test" }));
  if (process.env.TICKET_PDF_OUT) fs.writeFileSync(process.env.TICKET_PDF_OUT, bytes);
  const { PDFDocument, PDFDict, PDFName } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  const names = doc.context
    .enumerateIndirectObjects()
    .flatMap(([, o]) => (o instanceof PDFDict && o.get(PDFName.of("Type")) === PDFName.of("Font") ? [String(o.get(PDFName.of("BaseFont")))] : []));
  assert.ok(names.some((n) => /DIN/i.test(n)), `geen DIN in pdf: ${names.join(", ")}`);
  assert.ok(names.some((n) => /Inter/i.test(n)), `geen Inter in pdf: ${names.join(", ")}`);
  assert.ok(!names.some((n) => /Helvetica|Arial/i.test(n)), `standaardletter in pdf: ${names.join(", ")}`);
});
