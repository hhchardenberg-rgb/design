import assert from "node:assert/strict";
import { test } from "node:test";
import { safeText, toCsv, toXlsx } from "../export";
import { readFirstSheet } from "../xlsx-read";

test("formules in cellen worden onschadelijk gemaakt", () => {
  assert.equal(safeText("=HYPERLINK(\"http://x\")"), "'=HYPERLINK(\"http://x\")");
  assert.equal(safeText("+31612345678"), "'+31612345678");
  assert.equal(safeText("-1"), "'-1");
  assert.equal(safeText("@cmd"), "'@cmd");
  assert.equal(safeText("Jan"), "Jan");
  assert.equal(safeText(null), "");
});

test("CSV: puntkomma, aanhalingstekens en regelovergangen", () => {
  const csv = toCsv([["Naam", "Opmerking", "Aantal"], ["Jan; Piet", 'Zei "hoi"\nnieuwe regel', 3]]);
  assert.ok(csv.startsWith("﻿Naam;Opmerking;Aantal\r\n"));
  assert.ok(csv.includes('"Jan; Piet";"Zei ""hoi""\nnieuwe regel";3'));
});

test("xlsx wordt door onze eigen lezer teruggelezen, ook met speciale tekens", async () => {
  const rows = [["Naam", "Aantal"], ["Zoë & <Co>", 12], ["=SOM(A1)", 0]];
  const back = await readFirstSheet(await toXlsx(rows));
  assert.deepEqual(back[0], ["Naam", "Aantal"]);
  assert.equal(back[1][0], "Zoë & <Co>");
  assert.equal(back[1][1], "12");
  assert.equal(back[2][0], "'=SOM(A1)");
});
