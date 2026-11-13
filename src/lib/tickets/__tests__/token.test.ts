import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { detectSource, linkTokenFor, newPublicId, parseLinkToken, parseQrCode, qrCodeFor, resetSigningKeys } from "../token";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

beforeEach(() => {
  delete process.env.VERCEL_ENV;
  process.env.TICKETS_SIGNING_KEY = KEY_A;
  resetSigningKeys();
});

test("publicId is 16 tekens uit het veilige alfabet en uniek", () => {
  const ids = new Set(Array.from({ length: 2000 }, newPublicId));
  assert.equal(ids.size, 2000);
  for (const id of ids) assert.match(id, /^[0-9A-HJKMNP-TV-Z]{16}$/);
});

test("QR heeft het HHC-voorvoegsel, bevat geen persoonsgegevens en is te controleren", () => {
  const id = newPublicId();
  const qr = qrCodeFor(id, 1);
  assert.match(qr, /^HHC1\.[0-9A-Z]{16}\.1\.[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(parseQrCode(qr), { publicId: id, version: 1 });
});

test("een aangepaste QR (ander id, andere versie of handtekening) wordt geweigerd", () => {
  const id = newPublicId();
  const qr = qrCodeFor(id, 3);
  const [p, , v, sig] = qr.split(".");
  assert.equal(parseQrCode(`${p}.${newPublicId()}.${v}.${sig}`), null);
  assert.equal(parseQrCode(`${p}.${id}.4.${sig}`), null);
  assert.equal(parseQrCode(`${p}.${id}.${v}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`), null);
  assert.equal(parseQrCode("HHC1.zomaar.1.iets"), null);
  assert.equal(parseQrCode(""), null);
});

test("zonder de sleutel is geen geldige QR te maken", () => {
  const id = newPublicId();
  const qr = qrCodeFor(id, 1);
  process.env.TICKETS_SIGNING_KEY = KEY_B;
  resetSigningKeys();
  assert.equal(parseQrCode(qr), null);
});

test("sleutelrotatie: oude sleutel blijft geldig zolang hij in de lijst staat", () => {
  const id = newPublicId();
  const qr = qrCodeFor(id, 1);
  process.env.TICKETS_SIGNING_KEY = `new:${KEY_B},old:${KEY_A}`;
  resetSigningKeys();
  assert.deepEqual(parseQrCode(qr), { publicId: id, version: 1 });
  assert.notEqual(qrCodeFor(id, 1), qr);
});

test("een link is geen QR en andersom", () => {
  const id = newPublicId();
  const link = linkTokenFor(id, 1);
  assert.deepEqual(parseLinkToken(link), { publicId: id, version: 1 });
  assert.equal(parseQrCode(`HHC1.${link}`), null);
  const qrSig = qrCodeFor(id, 1).split(".")[3];
  assert.equal(parseLinkToken(`${id}.1.${qrSig}`), null);
});

test("bronherkenning: HHC-voorvoegsel is HHC, de rest Fullhouse", () => {
  assert.equal(detectSource(qrCodeFor(newPublicId(), 1)), "HHC");
  assert.equal(detectSource(" hhc1.ABC "), "HHC");
  assert.equal(detectSource("1234567890123"), "FULLHOUSE");
  assert.equal(detectSource("HHC-123"), "FULLHOUSE");
});

test("in een Vercel-omgeving zonder sleutel weigert het systeem", () => {
  delete process.env.TICKETS_SIGNING_KEY;
  process.env.VERCEL_ENV = "preview";
  resetSigningKeys();
  assert.throws(() => qrCodeFor(newPublicId(), 1), /TICKETS_SIGNING_KEY/);
});

test("te korte sleutel wordt geweigerd", () => {
  process.env.TICKETS_SIGNING_KEY = Buffer.alloc(16).toString("base64");
  resetSigningKeys();
  assert.throws(() => qrCodeFor(newPublicId(), 1), /32 bytes/);
});

test("een niet-canonieke schrijfwijze van de handtekening wordt geweigerd", () => {
  for (let i = 0; i < 40; i++) {
    const id = newPublicId();
    const [p, , v, sig] = qrCodeFor(id, 1).split(".");
    // De laatste base64url-letter bevat 4 bits; andere letters met dezelfde 4 hoge bits geven dezelfde bytes.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const idx = alphabet.indexOf(sig.at(-1)!);
    const twin = alphabet[idx ^ 1];
    assert.equal(parseQrCode(`${p}.${id}.${v}.${sig.slice(0, -1)}${twin}`), null);
  }
});
