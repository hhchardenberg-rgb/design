import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TEMPLATES, fillTemplate, pdfSafe, templateIssues } from "../delivery";

test("fillTemplate vervangt bekende variabelen en laat onbekende staan", () => {
  assert.equal(fillTemplate("Hoi {voornaam}, {onbekend}", { voornaam: "Anne" }), "Hoi Anne, {onbekend}");
});

test("standaardtemplate is geldig", () => {
  const t = DEFAULT_TEMPLATES.ticket;
  assert.deepEqual(templateIssues(t.subject, t.body), []);
});

test("templateIssues meldt een onbekende variabele en lege velden", () => {
  assert.ok(templateIssues("Onderwerp", "Hoi {naam}").some((m) => m.includes("{naam}")));
  assert.equal(templateIssues("", "x").length, 1);
});

test("pdfSafe haalt tekens weg die de standaardlettertypen niet kennen", () => {
  assert.equal(pdfSafe("Zoë Łukasz"), "Zoe ?ukasz");
});
