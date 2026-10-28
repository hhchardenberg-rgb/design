import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAssignment, checkRoleEdit, combine, describeRole, fromAppRoles, legacyCommercialRoleId, roleWithinScope, sameSnapshot, toAppRoles, type ManagerScope, type RoleGrant } from "../model";

const role = (r: Partial<RoleGrant>): RoleGrant => ({ isAdmin: false, hubLevel: "NONE", ticketingLevel: "NONE", commercial: null, ...r });
const scope = (s: Partial<ManagerScope>): ManagerScope => ({ userId: "me", full: false, hubAdmin: false, ticketingAdmin: false, commercialManage: false, commercialGrantable: new Set(), ...s });

test("rollen tellen op: hoogste niveau per onderdeel en alle CZ-bevoegdheden samen", () => {
  const c = combine([
    role({ hubLevel: "USER", commercial: ["companies:read"] }),
    role({ hubLevel: "ADMIN" }),
    role({ ticketingLevel: "USER", commercial: ["contacts:read", "onzin"] }),
  ]);
  assert.equal(c.hubLevel, "ADMIN");
  assert.equal(c.ticketingLevel, "USER");
  assert.equal(c.commercial, true);
  assert.deepEqual(c.commercialPermissions, ["companies:read", "contacts:read"]);
  assert.equal(c.isAdmin, false);
  assert.equal(combine([role({ commercial: [] })]).commercial, true); // toegang zonder bevoegdheden blijft toegang
});

test("vertaling naar de rolwaarden in het inlogtoken en terug", () => {
  assert.deepEqual(toAppRoles({ isAdmin: false, hubLevel: "ADMIN", ticketingLevel: "USER" }), ["HUB", "HUB_ADMIN", "TICKETING"]);
  assert.deepEqual(toAppRoles({ isAdmin: false, hubLevel: "NONE", ticketingLevel: "NONE" }), ["USER"]); // nooit leeg
  assert.deepEqual(fromAppRoles(["HUB_ADMIN"]), { isAdmin: false, hubLevel: "ADMIN", ticketingLevel: "NONE" });
  assert.deepEqual(fromAppRoles(["ADMIN", "HUB", "TICKETING_ADMIN"]), { isAdmin: true, hubLevel: "USER", ticketingLevel: "ADMIN" });
  assert.deepEqual(fromAppRoles(["USER"]), { isAdmin: false, hubLevel: "NONE", ticketingLevel: "NONE" });
});

test("samenvatting per onderdeel", () => {
  assert.deepEqual(describeRole(role({ hubLevel: "USER", commercial: ["companies:read", "x"] })), ["Communicatie: gebruiker", "Commerciële Zaken: 1 bevoegdheid"]);
  assert.deepEqual(describeRole(role({})), ["Geeft (nog) nergens toegang toe"]);
  assert.match(describeRole(role({ isAdmin: true }))[0], /Alles/);
});

test("hoofdadmin mag alles; beheerder van een onderdeel alleen gebruikerstoegang tot dat onderdeel", () => {
  const full = scope({ full: true });
  assert.equal(roleWithinScope(full, role({ isAdmin: true })).ok, true);
  const hub = scope({ hubAdmin: true });
  assert.equal(roleWithinScope(hub, role({ hubLevel: "USER" })).ok, true);
  assert.equal(roleWithinScope(hub, role({ hubLevel: "ADMIN" })).ok, false);
  assert.equal(roleWithinScope(hub, role({ hubLevel: "USER", ticketingLevel: "USER" })).ok, false);
  assert.equal(roleWithinScope(hub, role({ isAdmin: true })).ok, false);
  assert.equal(roleWithinScope(hub, role({ commercial: [] })).ok, false);
});

test("CZ-beheerder geeft alleen bevoegdheden door die hij zelf heeft", () => {
  const cz = scope({ commercialManage: true, commercialGrantable: new Set(["companies:read", "rights:manage_rights"]) });
  assert.equal(roleWithinScope(cz, role({ commercial: ["companies:read"] })).ok, true);
  assert.equal(roleWithinScope(cz, role({ commercial: ["invoices:read"] })).ok, false);
  assert.equal(roleWithinScope(cz, role({ commercial: ["companies:read"], hubLevel: "USER" })).ok, false);
});

test("toewijzen: niet bij jezelf, niet bij een hoofdadmin, en alleen rollen binnen je bereik", () => {
  const hub = scope({ hubAdmin: true });
  const comm = role({ hubLevel: "USER" });
  assert.equal(checkAssignment(hub, { userId: "ander", isAdmin: false }, [comm]).ok, true);
  assert.equal(checkAssignment(hub, { userId: "me", isAdmin: false }, [comm]).ok, false);
  assert.equal(checkAssignment(hub, { userId: "ander", isAdmin: true }, [comm]).ok, false);
  assert.equal(checkAssignment(hub, { userId: "ander", isAdmin: false }, [role({ ticketingLevel: "USER" })]).ok, false);
  assert.equal(checkAssignment(scope({ full: true }), { userId: "me", isAdmin: true }, [role({ isAdmin: true })]).ok, true);
});

test("rol bewerken: de vaste Hoofdadmin-rol blijft bestaan en blijft alles geven", () => {
  const full = scope({ full: true });
  const admin = role({ isAdmin: true });
  assert.equal(checkRoleEdit(full, admin, null, { isSystem: true }).ok, false);
  assert.equal(checkRoleEdit(full, admin, role({}), { isSystem: true }).ok, false);
  assert.equal(checkRoleEdit(full, admin, admin, { isSystem: true }).ok, true);
  const hub = scope({ hubAdmin: true });
  assert.equal(checkRoleEdit(hub, role({ hubLevel: "USER" }), role({ hubLevel: "USER" }), { holdsRole: true }).ok, false);
  assert.equal(checkRoleEdit(hub, role({ hubLevel: "USER" }), role({ hubLevel: "ADMIN" })).ok, false);
  assert.equal(checkRoleEdit(hub, null, role({ hubLevel: "USER" })).ok, true);
});

test("vergelijking met de oude velden", () => {
  const base = { isAdmin: false, hubLevel: "USER" as const, ticketingLevel: "NONE" as const, commercialMember: false, commercialRoleId: "x" };
  assert.equal(sameSnapshot(base, { ...base, commercialRoleId: "y" }), true); // zonder lidmaatschap telt de CZ-rol niet
  assert.equal(sameSnapshot({ ...base, commercialMember: true }, { ...base, commercialMember: true, commercialRoleId: "y" }), false);
  assert.equal(legacyCommercialRoleId([{ commercialRoleId: "a" }, { commercialRoleId: null }]), "a");
  assert.equal(legacyCommercialRoleId([{ commercialRoleId: "a" }, { commercialRoleId: "b" }]), null);
});
