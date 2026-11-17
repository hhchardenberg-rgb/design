// Weergave van het ticket zoals de ontvanger het krijgt: de QR-code in de A4-pdf moet na renderen
// leesbaar zijn (op elke zoomstand), en de mobiele pagina moet op de server dezelfde html geven als
// bij de eerste weergave in de browser (anders een hydratiefout en een knipperende "Bewaar"-knop).
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import type { TicketFacts } from "../view";

const CODE = "HHC1.0MRW20S4BZ2E1CCK.1.Fds3_TUYo7s9KR1WgfPzPg";

const facts = (): TicketFacts =>
  ({
    sample: false, kind: "match", firstName: "Jan", lastName: "de Vries", company: null, typeName: "Staanplaats", typeColor: null,
    ticketNumber: "0MRW-20S4-BZ2E-1CCK", qrCode: CODE, seasonName: "2026/2027", validityText: "Geldig voor deze wedstrijd",
    event: { title: "HHC Hardenberg – Katwijk", opponent: "Katwijk", isHome: true, competition: null, startsAt: "2026-11-21T14:30:00Z", location: null, status: "ACTIVE", opponentLogoUrl: null },
    events: [], zoneName: null, entranceName: null, notices: [], statusLabel: "Actief", usable: true,
  }) as unknown as TicketFacts;

test("A4-pdf: de QR-code is na renderen op elke schaal leesbaar (geen haarlijnen tussen de rijen)", async () => {
  const { buildView } = await import("../view");
  const { resolveFormat } = await import("../resolve");
  const { layoutForView, renderPdf } = await import("../pdf.server");
  const view = buildView(facts(), resolveFormat([], "a4"), "a4", {});
  const bytes = await renderPdf([await layoutForView(view, null)], async () => null, { title: "test" });

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const jsQR = (await import("jsqr")).default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise;
  const page = await pdf.getPage(1);
  for (const scale of [1.5, 2, 3, 4]) {
    const vp = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp, canvas: canvas as unknown as HTMLCanvasElement }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    assert.equal(jsQR(img.data, img.width, img.height)?.data, CODE, `QR niet leesbaar op schaal ${scale}`);
  }
  await pdf.cleanup();
});

test("mobiele ticketpagina: de serverhtml bevat de knop 'Bewaar op dit toestel' (zelfde als de eerste clientweergave)", async () => {
  // De component importeert een css-bestand; dat kan Node niet laden en is hier niet nodig.
  (Module as unknown as { _extensions: Record<string, () => void> })._extensions[".css"] = () => {};
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { buildView } = await import("../view");
  const { resolveFormat } = await import("../resolve");
  const { MobileTicket } = await import("@/components/tickets/design/mobile-ticket");
  const view = buildView(facts(), resolveFormat([], "mobile"), "mobile", {});
  const html = renderToString(createElement(MobileTicket, { view, pdfHref: "/t/x/pdf", offline: true }));
  assert.match(html, /Bewaar op dit toestel/);
});
