import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_SOURCES, SECTIONS, STANDARD_ROLES, matchesStandard, standardRole, standardRolesOf } from "../presets";
import { ticketPermissionIssues, ticketsNeedsMfa } from "@/lib/tickets/permissions";
import { findInconsistencies } from "@/lib/commercial/permissions";
import { roleGroup, shortName } from "@/components/access/access-parts";

test("standaardrollen: unieke sleutels en namen, geldige bevoegdheden, vaste naamvorm", () => {
  assert.equal(new Set(STANDARD_ROLES.map((r) => r.key)).size, STANDARD_ROLES.length);
  assert.equal(new Set(STANDARD_ROLES.map((r) => r.name)).size, STANDARD_ROLES.length);
  for (const r of STANDARD_ROLES) {
    assert.deepEqual(ticketPermissionIssues(r.tickets ?? []), [], r.name);
    if (r.commercial) assert.deepEqual(findInconsistencies(r.commercial), [], r.name);
    assert.ok(r.name.startsWith(`${r.section} – `), r.name);
    assert.ok(r.name.length <= 80);
    assert.ok(!/sponsorcommissie/i.test(r.name + r.description));
    assert.ok(LEGACY_SOURCES[r.key], `herkomst voor ${r.key}`);
  }
});

const covers = (hi: readonly string[] | null, lo: readonly string[] | null) => lo === null || (hi !== null && lo.every((p) => hi.includes(p)));
const RANK = { NONE: 0, USER: 1, ADMIN: 2 } as const;

test("niveaus volgen elkaar op: elk niveau kan alles van het vorige", () => {
  for (const section of SECTIONS) {
    const levels = standardRolesOf(section).filter((r) => r.kind === "niveau");
    assert.ok(levels.length >= 2, section);
    for (let i = 1; i < levels.length; i++) {
      const [lo, hi] = [levels[i - 1], levels[i]];
      assert.ok(RANK[hi.hubLevel] >= RANK[lo.hubLevel] && RANK[hi.ticketingLevel] >= RANK[lo.ticketingLevel], `${hi.name} ⊇ ${lo.name}`);
      assert.ok(covers(hi.commercial, lo.commercial), `${hi.name} ⊇ ${lo.name} (CZ)`);
      assert.ok(covers(hi.tickets, lo.tickets), `${hi.name} ⊇ ${lo.name} (tickets)`);
    }
  }
});

test("klantenservice en scanner: juiste rechten en 2FA", () => {
  const ks = standardRole("ks-medewerker")!;
  for (const p of ["support:search", "tickets:read", "tickets:resend"] as const) assert.ok(ks.tickets!.includes(p));
  assert.ok(!ks.tickets!.includes("tickets:block"));
  assert.equal(standardRole("ks-basis")!.tickets, null);
  assert.ok(standardRole("ks-teamleider")!.tickets!.includes("tickets:block"));
  assert.equal(ticketsNeedsMfa(standardRole("tickets-scanner")!.tickets!), false);
  assert.equal(ticketsNeedsMfa(ks.tickets!), true);
  assert.ok(!standardRole("tickets-beheerder")!.tickets!.includes("reports:revenue"));
});

test("matchesStandard en indeling per onderdeel", () => {
  const s = standardRole("ks-medewerker")!;
  assert.ok(matchesStandard(s, { hubLevel: "NONE", ticketingLevel: "USER", commercial: null, tickets: [...s.tickets!].reverse() }));
  assert.ok(!matchesStandard(s, { hubLevel: "NONE", ticketingLevel: "USER", commercial: null, tickets: null }));
  const view = (key: string) => {
    const p = standardRole(key)!;
    return { id: key, name: p.name, description: null, isSystem: false, isAdmin: false, hubLevel: p.hubLevel, ticketingLevel: p.ticketingLevel, commercial: p.commercial, tickets: p.tickets, presetKey: key, userCount: 0, manageable: true, manageReason: null };
  };
  assert.equal(roleGroup(view("ks-teamleider")), "Klantenservice");
  assert.equal(shortName(view("ks-teamleider")), "Teamleider");
  assert.equal(roleGroup(view("tickets-ontwerper")), "Tickets");
  assert.equal(roleGroup({ ...view("ks-teamleider"), presetKey: null }), "Eigen rollen");
});
