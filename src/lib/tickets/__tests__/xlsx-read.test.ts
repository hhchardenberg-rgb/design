import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "@/lib/commercial/xlsx";
import { readFirstSheet } from "../xlsx-read";
import { parseBulkRows } from "../bulk";

test("leest een Excel-bestand terug naar bulkregels", async () => {
  const file = await buildXlsx([{ name: "Lijst", header: ["Voornaam", "Achternaam", "E-mail"], rows: [["Jan", "Jansen & Zn", "jan@x.nl"], ["Eva", "de Boer", ""]] }]);
  const rows = await readFirstSheet(file);
  const r = parseBulkRows(rows);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.holders.length, 2);
  assert.equal(r.holders[0].lastName, "Jansen & Zn");
});

test("geen Excel-bestand geeft een begrijpelijke fout", async () => {
  await assert.rejects(readFirstSheet(new TextEncoder().encode("geen zip")), /geen geldig Excel/);
});
