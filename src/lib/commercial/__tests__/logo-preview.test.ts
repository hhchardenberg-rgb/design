import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument, rgb } from "pdf-lib";
import { decodeEpsi, makePreview, PREVIEW_MAX } from "../logo-preview.server";

const size = async (png: Buffer) => {
  const m = await sharp(png).metadata();
  return [m.format, m.width, m.height];
};

test("PDF (en AI): eerste pagina wordt een PNG", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 100]).drawRectangle({ x: 10, y: 10, width: 180, height: 80, color: rgb(1, 0.43, 0) });
  const pdf = Buffer.from(await doc.save());
  for (const ext of ["pdf", "ai"]) {
    const r = await makePreview(ext, pdf);
    assert.equal(r?.kind, "pdf");
    assert.deepEqual(await size(r!.png), ["png", PREVIEW_MAX, PREVIEW_MAX / 2]);
    // Midden van de pagina is oranje.
    const { data, info } = await sharp(r!.png).raw().toBuffer({ resolveWithObject: true });
    const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    assert.deepEqual([data[i], data[i + 2]], [255, 0]);
  }
});

test("SVG wordt gerasterd, scripts doen niets", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50"><script>alert(1)</script><rect width="100" height="50" fill="#ff6f00"/></svg>');
  const r = await makePreview("svg", svg);
  assert.equal(r?.kind, "svg");
  assert.deepEqual(await size(r!.png), ["png", PREVIEW_MAX, PREVIEW_MAX / 2]);
});

test("binaire EPS: het ingebouwde TIFF-voorbeeld wordt gebruikt", async () => {
  const tiff = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#ff6f00" } }).tiff().toBuffer();
  const ps = Buffer.from("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 40 20\n");
  const head = Buffer.alloc(30);
  head.writeUInt32BE(0xc5d0d3c6, 0);
  head.writeUInt32LE(30, 4);
  head.writeUInt32LE(ps.length, 8);
  head.writeUInt32LE(30 + ps.length, 20);
  head.writeUInt32LE(tiff.length, 24);
  head.writeUInt16LE(0xffff, 28);
  const r = await makePreview("eps", Buffer.concat([head, ps, tiff]));
  assert.equal(r?.kind, "eps-tiff");
  assert.deepEqual(await size(r!.png), ["png", 40, 20]);
});

test("EPSI-voorbeeld: 0 is wit, 1 is zwart, rijen van boven naar beneden", async () => {
  const eps = Buffer.from("%!PS-Adobe-3.0 EPSF-3.0\n%%BeginPreview: 8 2 1 2\n%F0\n%0F\n%%EndPreview\nshowpage\n");
  const d = decodeEpsi(eps)!;
  assert.deepEqual([d.width, d.height], [8, 2]);
  assert.deepEqual([...d.gray], [0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0]);
  assert.equal((await makePreview("eps", eps))?.kind, "eps-epsi");
});

test("geen voorbeeld bij EPS zonder ingebouwd voorbeeld of een kapot bestand; gooit niet", async () => {
  assert.equal(await makePreview("eps", Buffer.from("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 40 20\nshowpage\n")), null);
  assert.equal(await makePreview("png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])), null);
  assert.equal(await makePreview("docx", Buffer.from("PK")), null);
});
