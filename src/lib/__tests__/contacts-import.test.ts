import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeName, parseContactList } from "@/lib/contacts-import";

test("leest tab-gescheiden lijst met naam en telefoon in één kolom", () => {
  const input = [
    "Voorzitter\tJan Jansen +31 6 12345678",
    "Clubhuis \tPiet de Vries +31 6 87654321",
    "Voetbal jeugd - organisatie & opleiding\tKees van der Berg +31 6 11223344",
    "",
  ].join("\n");
  const { rows, errors } = parseContactList(input);
  assert.equal(errors.length, 0);
  assert.deepEqual(
    rows.map((r) => [r.role, r.name, r.phone]),
    [
      ["Voorzitter", "Jan Jansen", "+31 6 12345678"],
      ["Clubhuis", "Piet de Vries", "+31 6 87654321"],
      ["Voetbal jeugd - organisatie & opleiding", "Kees van der Berg", "+31 6 11223344"],
    ]
  );
});

test("leest drie kolommen met puntkomma, slaat kopregel over en herkent e-mail", () => {
  const { rows } = parseContactList("Functie;Naam;Telefoon\nSecretaris;Anna Smit;06-12345678 \nPenningmeester;Bob Bakker;bob@example.nl");
  assert.deepEqual(
    rows.map((r) => [r.role, r.name, r.phone, r.email]),
    [
      ["Secretaris", "Anna Smit", "06-12345678", null],
      ["Penningmeester", "Bob Bakker", null, "bob@example.nl"],
    ]
  );
});

test("meldt regels zonder scheiding tussen functie en naam", () => {
  const { rows, errors } = parseContactList("Alleen een naam");
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 1);
});

test("normaliseert namen voor dubbelencontrole", () => {
  assert.equal(normalizeName("  René   Kuizenga "), normalizeName("rene kuizenga"));
});
