import { test } from "node:test";
import assert from "node:assert/strict";
import { STANDARD_ROLES, standardRole } from "../presets";
import { ticketPermissionIssues, ticketsNeedsMfa } from "@/lib/tickets/permissions";
import { roleGroup } from "@/components/access/access-parts";

test("standaardrollen: unieke sleutels en namen, geldige bevoegdheden", () => {
  assert.equal(new Set(STANDARD_ROLES.map((r) => r.key)).size, STANDARD_ROLES.length);
  assert.equal(new Set(STANDARD_ROLES.map((r) => r.name)).size, STANDARD_ROLES.length);
  for (const r of STANDARD_ROLES) {
    assert.deepEqual(ticketPermissionIssues(r.tickets ?? []), [], r.name);
    assert.ok(r.name.length <= 80);
    assert.ok(!/sponsorcommissie/i.test(r.name + r.description));
  }
});

test("standaardrollen: klantenservice zoekt en verstuurt opnieuw, scanner heeft geen 2FA nodig", () => {
  const ks = standardRole("ks-medewerker")!;
  assert.equal(ks.ticketingLevel, "USER");
  for (const p of ["support:search", "tickets:read", "tickets:resend"] as const) assert.ok(ks.tickets!.includes(p));
  assert.ok(!ks.tickets!.includes("tickets:block"));
  assert.ok(standardRole("ks-teamleider")!.tickets!.includes("tickets:block"));
  assert.equal(ticketsNeedsMfa(standardRole("tickets-scanner")!.tickets!), false);
  assert.equal(ticketsNeedsMfa(ks.tickets!), true);
  // Niemand krijgt via een standaardrol beheerrechten over een onderdeel.
  assert.ok(STANDARD_ROLES.every((r) => r.ticketingLevel !== "ADMIN"));
  assert.ok(!standardRole("tickets-beheerder")!.tickets!.includes("reports:revenue"));
});

test("standaardrollen staan onder hun eigen kopje", () => {
  const view = (key: string) => {
    const p = standardRole(key)!;
    return { id: key, name: p.name, description: null, isSystem: false, isAdmin: false, hubLevel: "NONE" as const, ticketingLevel: p.ticketingLevel, commercial: null, tickets: p.tickets, presetKey: key, userCount: 0, manageable: true, manageReason: null };
  };
  assert.equal(roleGroup(view("ks-teamleider")), "Klantenservice");
  assert.equal(roleGroup(view("tickets-ontwerper")), "HHC Tickets");
  assert.equal(roleGroup({ ...view("ks-teamleider"), presetKey: null }), "Gecombineerd");
});
