import { test } from "node:test";
import assert from "node:assert/strict";
import { hasAnyAdminRole, hasRole, isSectionAdmin, resolveHomePath, type AppRole } from "../roles";

// Opzet: drie onderdelen, één beheer. Hoofdadmin ziet alles; een beheerder van een onderdeel alleen dat onderdeel.

test("hoofdadmin voldoet aan elke rol", () => {
  for (const r of ["HUB", "TICKETING", "HUB_ADMIN", "TICKETING_ADMIN"] as AppRole[]) assert.equal(hasRole(["ADMIN"], r), true);
  assert.equal(isSectionAdmin(["ADMIN"], "hub"), true);
  assert.equal(isSectionAdmin(["ADMIN"], "ticketing"), true);
});

test("beheerder van een onderdeel heeft alleen dat onderdeel", () => {
  const hub: AppRole[] = ["HUB_ADMIN"];
  assert.equal(hasRole(hub, "HUB"), true); // beheerder heeft ook zelf toegang
  assert.equal(hasRole(hub, "TICKETING"), false);
  assert.equal(isSectionAdmin(hub, "hub"), true);
  assert.equal(isSectionAdmin(hub, "ticketing"), false);
  assert.equal(hasRole(hub, "ADMIN"), false);
  assert.equal(hasRole(hub, "TICKETING_ADMIN"), false);
});

test("beheerder van twee onderdelen kan beide beheren", () => {
  const both: AppRole[] = ["HUB_ADMIN", "TICKETING_ADMIN"];
  assert.equal(isSectionAdmin(both, "hub") && isSectionAdmin(both, "ticketing"), true);
  assert.equal(hasRole(both, "HUB") && hasRole(both, "TICKETING"), true);
  assert.equal(hasRole(both, "ADMIN"), false);
});

test("gewone gebruikers hebben geen beheer", () => {
  assert.equal(hasAnyAdminRole(["HUB"]), false);
  assert.equal(hasAnyAdminRole(["TICKETING"]), false);
  assert.equal(hasAnyAdminRole([]), false);
  assert.equal(isSectionAdmin(["HUB"], "hub"), false);
  assert.equal(hasRole(["HUB"], "TICKETING"), false);
});

test("startpagina volgt de rollen", () => {
  assert.equal(resolveHomePath(["HUB"]), "/hub");
  assert.equal(resolveHomePath(["TICKETING_ADMIN"]), "/ticketing");
  assert.equal(resolveHomePath([]), "/geen-toegang");
});
