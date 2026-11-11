import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBulkCsv } from "../bulk";

test("leest een Nederlandse CSV met puntkomma's", () => {
  const r = parseBulkCsv("Voornaam;Achternaam;E-mailadres;Bedrijf\nJan;Jansen;JAN@example.nl;Bakkerij\nPiet;de Vries;;\n");
  assert.equal(r.errors.length, 0);
  assert.equal(r.holders.length, 2);
  assert.equal(r.holders[0].email, "jan@example.nl");
  assert.equal(r.holders[1].email, null);
  assert.equal(r.holders[1].company, null);
});

test("meldt fouten per regel en onbekende kolommen", () => {
  const r = parseBulkCsv("firstname,lastname,email,schoenmaat\nJan,,jan@x.nl,42\nPiet,Puk,geen-mail,43\nKlaas,Vaak,k@x.nl,44\n");
  assert.deepEqual(r.unknownColumns, ["schoenmaat"]);
  assert.equal(r.holders.length, 1);
  assert.deepEqual(r.errors.map((e) => e.row), [2, 3]);
});

test("verplichte kolommen en dubbele regels", () => {
  assert.equal(parseBulkCsv("E-mail\nx@y.nl\n").errors[0].message.includes("Voornaam"), true);
  const r = parseBulkCsv("Voornaam,Achternaam,Email\nJan,Jansen,j@x.nl\nJan,Jansen,j@x.nl\n");
  assert.equal(r.duplicates, 1);
});

test("maximaal aantal regels", () => {
  const rows = ["Voornaam,Achternaam", ...Array.from({ length: 5 }, (_, i) => `A${i},B`)].join("\n");
  const r = parseBulkCsv(rows, 3);
  assert.equal(r.holders.length, 3);
  assert.equal(r.errors.length, 1);
});
