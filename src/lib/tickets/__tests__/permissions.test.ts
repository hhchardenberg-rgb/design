import { test } from "node:test";
import assert from "node:assert/strict";
import { TICKET_ROLE_TEMPLATES, ticketPermissionIssues, withRequired } from "../permissions";

test("alle sjablonen zijn consistent", () => {
  for (const t of TICKET_ROLE_TEMPLATES) assert.deepEqual(ticketPermissionIssues(t.permissions), [], t.name);
});

test("de scanner mag alleen scannen en een notitie toevoegen", () => {
  const scanner = TICKET_ROLE_TEMPLATES.find((t) => t.key === "scanner")!;
  assert.deepEqual([...scanner.permissions].sort(), ["scan:note", "scan:scan"]);
  for (const forbidden of ["tickets:issue", "tickets:block", "exports:export", "reports:revenue", "settings:manage", "tickets:personal"]) {
    assert.equal((scanner.permissions as string[]).includes(forbidden), false, forbidden);
  }
});

test("vereiste bevoegdheden worden aangevuld en ontbrekende gemeld", () => {
  assert.deepEqual(withRequired(["tickets:bulk"]).sort(), ["events:read", "tickets:bulk", "tickets:issue", "tickets:read", "types:read"]);
  assert.equal(ticketPermissionIssues(["tickets:issue"]).length > 0, true);
  assert.equal(ticketPermissionIssues(["bestaat:niet"]).length, 1);
});

test("tweestapsverificatie verplicht voor iedereen die meer mag dan scannen", async () => {
  const { ticketsNeedsMfa } = await import("../permissions");
  assert.equal(ticketsNeedsMfa(["scan:scan", "scan:note"]), false);
  assert.equal(ticketsNeedsMfa(["scan:scan", "scan:override", "scan:history"]), true);
  assert.equal(ticketsNeedsMfa(["dashboard:read"]), true);
  assert.equal(ticketsNeedsMfa([]), false);
});
