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
  assert.equal(pdfSafe("Zoë Łukasz"), "Zoë ?ukasz");
});

test("meertalig: elke taal heeft een eigen ticketmail met de verplichte velden", async () => {
  const { templateKeyFor, textsFor, asLocale } = await import("../i18n");
  for (const l of ["nl", "en", "de"] as const) {
    const t = DEFAULT_TEMPLATES[templateKeyFor("ticket", l)];
    assert.ok(t, l);
    assert.deepEqual(templateIssues(t.subject, t.body), []);
    for (const base of ["event_moved", "event_cancelled"]) assert.ok(DEFAULT_TEMPLATES[templateKeyFor(base, l)], `${base}.${l}`);
  }
  assert.equal(asLocale("fr"), "nl");
  assert.equal(textsFor("de").pdf.title, "Eintrittskarte");
  assert.equal(pdfSafe("Gültig für Müller"), "Gültig für Müller");
});
