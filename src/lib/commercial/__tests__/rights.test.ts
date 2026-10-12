import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_PERMISSIONS, findInconsistencies, levelFor, permissionsForLevel, isPermission, type Permission } from "../permissions";
import { allowedSet, evaluate, type EvaluationInput } from "../evaluate";
import { ROLE_TEMPLATES } from "../role-templates";
import {
  checkAssignRole,
  checkEditRole,
  checkGrant,
  checkMembershipChange,
  checkNotRemovingLastRightsManager,
  checkRestrict,
  type Actor,
} from "../delegation";

const role = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
const eff = (input: Partial<EvaluationInput> & { role?: string }) =>
  allowedSet(
    evaluate({
      hasSectionAccess: input.hasSectionAccess ?? true,
      rolePermissions: input.role ? role(input.role) : (input.rolePermissions ?? []),
      overrides: input.overrides ?? [],
    }),
  );
const actor = (over: Partial<Actor> & { perms?: Permission[] }): Actor => ({
  userId: over.userId ?? "actor",
  isPlatformAdmin: over.isPlatformAdmin ?? false,
  effective: new Set(over.perms ?? []),
});

// --- Catalogus en templates ------------------------------------------------

test("alle roltemplates bevatten alleen bestaande en onderling consistente bevoegdheden", () => {
  for (const t of ROLE_TEMPLATES) {
    assert.ok(t.permissions.every(isPermission), `${t.key} bevat onbekende bevoegdheid`);
    assert.deepEqual(findInconsistencies(t.permissions), [], `${t.key} is inconsistent`);
    assert.equal(new Set(t.permissions).size, t.permissions.length, `${t.key} bevat dubbelen`);
  }
});

test("'Lezen en bewerken' omvat nooit risicovolle acties", () => {
  for (const p of ALL_PERMISSIONS) {
    const [area] = p.split(":");
    const edit = permissionsForLevel(area as never, "edit");
    for (const e of edit) assert.ok(/:(read|create|update)$/.test(e), `${e} hoort niet bij bewerken`);
  }
  const granted = new Set(permissionsForLevel("invoices", "edit"));
  assert.ok(!granted.has("invoices:approve") && !granted.has("invoices:send"));
  assert.deepEqual(levelFor("invoices", granted), { level: "edit", extras: [] });
  granted.add("invoices:send");
  assert.deepEqual(levelFor("invoices", granted), { level: "edit", extras: ["send"] });
});

test("wijzigen zonder lezen wordt gesignaleerd", () => {
  const issues = findInconsistencies(["invoices:update"]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].missing, "invoices:read");
});

// --- Evaluatievolgorde -----------------------------------------------------

test("zonder sectietoegang geen enkel recht, ook niet met rol of toestaan-uitzondering", () => {
  const e = eff({ hasSectionAccess: false, role: "beheerder", overrides: [{ permission: "companies:read", effect: "ALLOW" }] });
  assert.equal(e.size, 0);
});

test("rol levert basisrechten, toestaan voegt toe, blokkade wint", () => {
  const e = eff({
    role: "alleen-lezen",
    overrides: [
      { permission: "files:download", effect: "ALLOW" },
      { permission: "companies:read", effect: "DENY" },
      { permission: "companies:read", effect: "ALLOW" },
    ],
  });
  assert.ok(e.has("files:download"));
  assert.ok(!e.has("companies:read"), "blokkade moet winnen van zowel rol als toestaan");
});

test("een geblokkeerd leesrecht laat afhankelijke rechten vervallen", () => {
  const e = eff({ role: "sponsorcommissielid", overrides: [{ permission: "companies:read", effect: "DENY" }] });
  assert.ok(!e.has("companies:update"));
  assert.ok(!e.has("companies:create"));
  assert.ok(e.has("contacts:update"), "andere onderdelen blijven onafhankelijk");
});

test("een toestaan-uitzondering zonder leesrecht geeft geen werkend recht", () => {
  const e = eff({ rolePermissions: [], overrides: [{ permission: "invoices:send", effect: "ALLOW" }] });
  assert.ok(!e.has("invoices:send"));
});

// --- Gebruiksscenario's A–F uit de opdracht (D volgt met recordbereik in fase 3) ---

test("A: dossiers en contacthistorie bewerken, contracten alleen lezen, geen facturatie", () => {
  const e = eff({ role: "sponsorcommissielid" });
  assert.ok(e.has("companies:update") && e.has("history:update"));
  assert.ok(e.has("contracts:read") && !e.has("contracts:update"));
  for (const p of ALL_PERMISSIONS.filter((x) => /^(invoices|credit_notes|payments):/.test(x))) assert.ok(!e.has(p), p);
});

test("B: facturen en betalingen beheren zonder rechten te mogen wijzigen", () => {
  const e = eff({ role: "financieel-medewerker" });
  assert.ok(e.has("invoices:update") && e.has("payments:create"));
  assert.ok(!e.has("rights:manage_rights") && !e.has("rights:read"));
});

test("C: mailings voorbereiden maar niet verzenden", () => {
  const e = eff({ role: "mailingbeheerder" });
  assert.ok(e.has("mailings:create") && e.has("mailings:update"));
  assert.ok(!e.has("mailings:send"));
});

test("E: logo's bekijken en downloaden, geen vertrouwelijke contractdocumenten", () => {
  const e = eff({ role: "alleen-lezen", overrides: [{ permission: "files:download", effect: "ALLOW" }] });
  assert.ok(e.has("files:read") && e.has("files:download"));
  assert.ok(!e.has("contract_documents:read") && !e.has("contract_documents:download"));
});

test("F: inkomsten en rapportages bekijken, geen bedragen wijzigen en geen exports", () => {
  const e = eff({ rolePermissions: ["amounts:read", "reports:read"] });
  assert.ok(e.has("amounts:read") && e.has("reports:read"));
  assert.ok(!e.has("amounts:update") && !e.has("exports:export"));
});

test("financiële zichtbaarheid is afzonderlijk: dossierrechten geven geen bedragen", () => {
  const e = eff({ role: "sponsorcommissielid" });
  assert.ok(!e.has("amounts:read"));
});

test("bedragen lezen geeft geen indexatie toepassen", () => {
  const e = eff({ role: "relatiebeheerder" });
  assert.ok(e.has("amounts:read") && !e.has("amounts:approve") && !e.has("amounts:update"));
});

test("factuurconcept bewerken is niet definitief maken of versturen", () => {
  const e = eff({ rolePermissions: ["invoices:read", "invoices:create", "invoices:update"] });
  assert.ok(!e.has("invoices:approve") && !e.has("invoices:send"));
});

// --- Delegatie -------------------------------------------------------------

test("zonder rechtenbeheer kun je niets toekennen of afnemen", () => {
  const a = actor({ perms: ["companies:read"] });
  assert.equal(checkGrant(a, "x", ["companies:read"]).ok, false);
  assert.equal(checkRestrict(a, "x").ok, false);
});

test("je kunt je eigen rechten niet aanpassen", () => {
  const a = actor({ userId: "me", perms: ["rights:manage_rights", "rights:read", "companies:read"] });
  assert.equal(checkGrant(a, "me", ["companies:read"]).ok, false);
  assert.equal(checkRestrict(a, "me").ok, false);
});

test("alleen rechten binnen de eigen grens uitdelen", () => {
  const a = actor({ perms: ["rights:manage_rights", "rights:read", "companies:read", "companies:update"] });
  assert.equal(checkGrant(a, "x", ["companies:read"]).ok, true);
  const d = checkGrant(a, "x", ["invoices:approve"]);
  assert.equal(d.ok, false);
  assert.equal(checkAssignRole(a, "x", role("financieel-medewerker")).ok, false);
});

test("een rol aanpassen mag niet buiten de grens of een rol van jezelf raken", () => {
  const a = actor({ perms: ["rights:manage_rights", "companies:read"] });
  assert.equal(checkEditRole(a, ["invoices:read"], false).ok, false);
  assert.equal(checkEditRole(a, ["companies:read"], true).ok, false);
  assert.equal(checkEditRole(a, ["companies:read"], false).ok, true);
});

test("sectietoegang geven of intrekken kan alleen een platformbeheerder, nooit het laatste rechtenbeheer", () => {
  assert.equal(checkMembershipChange(actor({}), "grant").ok, false);
  assert.equal(checkMembershipChange(actor({ isPlatformAdmin: true }), "grant").ok, true);
  assert.equal(checkMembershipChange(actor({ isPlatformAdmin: true }), "revoke", { targetIsLastRightsManager: true }).ok, false);
  assert.equal(checkNotRemovingLastRightsManager(true, 0).ok, false);
  assert.equal(checkNotRemovingLastRightsManager(true, 1).ok, true);
});

test("een platformbeheerder zonder lidmaatschap heeft geen inhoudelijke rechten", () => {
  const e = eff({ hasSectionAccess: false });
  assert.equal(e.size, 0);
  const a = actor({ isPlatformAdmin: true });
  assert.equal(checkGrant(a, "x", ["companies:read"]).ok, false, "platformbeheer is geen rechtenbeheer binnen de sectie");
});
