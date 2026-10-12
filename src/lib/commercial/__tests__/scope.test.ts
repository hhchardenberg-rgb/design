import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeOwned, canSeeTask, companyScopeWhere, normalizeNameKey, scopeWithinLimit, taskScopeWhere } from "../scope";

const me = { userId: "me", teamIds: ["t1"] };

test("bereik OWN: alleen eigen records, ook niet via een team", () => {
  assert.ok(canSeeOwned("OWN", { ownerId: "me", teamId: null }, me));
  assert.ok(!canSeeOwned("OWN", { ownerId: "other", teamId: "t1" }, me));
  assert.ok(!canSeeOwned("OWN", { ownerId: null, teamId: null }, me));
});

test("bereik TEAM: eigen records en records van het eigen team", () => {
  assert.ok(canSeeOwned("TEAM", { ownerId: "other", teamId: "t1" }, me));
  assert.ok(!canSeeOwned("TEAM", { ownerId: "other", teamId: "t2" }, me));
  assert.ok(!canSeeOwned("TEAM", { ownerId: "other", teamId: null }, me));
});

test("bereik ALL ziet alles", () => {
  assert.ok(canSeeOwned("ALL", { ownerId: null, teamId: null }, me));
  assert.deepEqual(companyScopeWhere("ALL", me), {});
});

test("Prisma-filters volgen dezelfde regels", () => {
  assert.deepEqual(companyScopeWhere("OWN", me), { OR: [{ ownerId: "me" }] });
  assert.deepEqual(companyScopeWhere("TEAM", me), { OR: [{ ownerId: "me" }, { teamId: { in: ["t1"] } }] });
  assert.deepEqual(companyScopeWhere("TEAM", { userId: "me", teamIds: [] }), { OR: [{ ownerId: "me" }] });
  assert.deepEqual(taskScopeWhere("OWN", me), { OR: [{ assigneeId: "me" }, { createdById: "me" }] });
});

test("taken: toegewezen of aangemaakt door jou, of van je team", () => {
  assert.ok(canSeeTask("OWN", { assigneeId: "me", createdById: "x", teamId: null }, me));
  assert.ok(canSeeTask("OWN", { assigneeId: "x", createdById: "me", teamId: null }, me));
  assert.ok(!canSeeTask("OWN", { assigneeId: "x", createdById: "y", teamId: "t1" }, me));
  assert.ok(canSeeTask("TEAM", { assigneeId: "x", createdById: "y", teamId: "t1" }, me));
});

test("een ruimer bereik uitdelen dan je zelf hebt mag niet", () => {
  assert.ok(scopeWithinLimit("OWN", "TEAM"));
  assert.ok(scopeWithinLimit("TEAM", "TEAM"));
  assert.ok(!scopeWithinLimit("ALL", "TEAM"));
});

test("naamnormalisatie vangt veelvoorkomende varianten", () => {
  assert.equal(normalizeNameKey("Bakkerij Jansen B.V."), normalizeNameKey("bakkerij  jansen bv"));
  assert.equal(normalizeNameKey("Café Wiën"), "cafewien");
});
