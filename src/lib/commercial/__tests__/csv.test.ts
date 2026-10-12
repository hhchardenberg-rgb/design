import { test } from "node:test";
import assert from "node:assert/strict";
import { csvSafeCell, detectDelimiter, parseCsv } from "../csv";

test("puntkomma, aanhalingstekens, regelafbrekingen en BOM", () => {
  const rows = parseCsv('﻿Naam;Plaats;Notitie\r\n"Jansen; B.V.";Hardenberg;"zegt ""ja""\nen nog iets"\r\nDe Vries;;\r\n');
  assert.deepEqual(rows, [["Naam", "Plaats", "Notitie"], ["Jansen; B.V.", "Hardenberg", 'zegt "ja"\nen nog iets'], ["De Vries", "", ""]]);
});
test("detecteert scheidingsteken en slaat lege regels over", () => {
  assert.equal(detectDelimiter("a,b,c\n1,2,3"), ",");
  assert.equal(detectDelimiter("a;b;c"), ";");
  assert.deepEqual(parseCsv("a,b\n\n1,2\n   ,  \n"), [["a", "b"], ["1", "2"]]);
});
test("formules in cellen worden onschadelijk gemaakt", () => {
  for (const bad of ["=1+1", "+SUM(A1)", "-2", "@cmd", "\t=x"]) assert.ok(csvSafeCell(bad).startsWith("'"));
  assert.equal(csvSafeCell("Gewone tekst"), "Gewone tekst");
});
