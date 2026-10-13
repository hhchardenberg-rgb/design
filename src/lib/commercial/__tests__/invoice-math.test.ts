import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, formatDocumentNumber, isValidDutchVatNumber, isValidIban, isValidKvk, totalsOf } from "../invoice-math";

test("btw per tarief over het totaal, afgerond", () => {
  const t = totalsOf([
    { quantity: 1, unitCents: 10_001, vatRateBp: 2100 },
    { quantity: 1, unitCents: 10_001, vatRateBp: 2100 },
    { quantity: 2, unitCents: 5_000, vatRateBp: 900 },
    { quantity: 1, unitCents: 3_000, vatRateBp: 0 },
  ]);
  assert.deepEqual(t.groups, [
    { vatRateBp: 0, netCents: 3_000, vatCents: 0 },
    { vatRateBp: 900, netCents: 10_000, vatCents: 900 },
    { vatRateBp: 2100, netCents: 20_002, vatCents: 4_200 }, // 4200,42 afgerond, niet per regel 2x2100,21
  ]);
  assert.equal(t.netCents, 33_002);
  assert.equal(t.vatCents, 5_100);
  assert.equal(t.grossCents, 38_102);
  // Regels zonder gekozen tarief tellen niet mee (document is dan nog niet definitief te maken).
  assert.equal(totalsOf([{ quantity: 1, unitCents: 100, vatRateBp: null }]).grossCents, 0);
});

test("IBAN, btw-nummer en KvK-controle", () => {
  assert.equal(isValidIban("NL91 ABNA 0417 1643 00"), true); // voorbeeld-IBAN uit de IBAN-standaard
  assert.equal(isValidIban("NL91ABNA0417164301"), false);
  assert.equal(isValidIban("geen iban"), false);
  assert.equal(isValidDutchVatNumber("nl123456789b01"), true);
  assert.equal(isValidDutchVatNumber("NL123456789"), false);
  assert.equal(isValidKvk("05026683"), true);
  assert.equal(isValidKvk("5026683"), false);
});

test("nummering en datums", () => {
  assert.equal(formatDocumentNumber("2026-", 7), "2026-0007");
  assert.equal(formatDocumentNumber(null, 12345), "12345");
  assert.equal(addDays("2026-12-20", 30), "2027-01-19");
});
