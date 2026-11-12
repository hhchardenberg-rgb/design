import test from "node:test";
import assert from "node:assert/strict";
import { buildAlerts, timeline } from "../matchday.server";

const at = (min: number) => new Date(Date.UTC(2026, 10, 14, 14, min));
const scan = (id: string, over: Record<string, unknown> = {}) => ({
  id, ticketId: null, codeHash: null, result: "VALID", reason: null, reentry: false, entranceId: null, scannerId: null,
  scannedAt: at(0), overrideBy: null, overrideReason: null, note: null, holderLabel: null, ...over,
});
const ctx = { now: at(60), inside: 10, capacity: null, scannerNames: new Map([["s1", "Scanner 1"]]), entranceNames: new Map([["e1", "Hoofdingang"]]) };

test("geen meldingen bij een rustige wedstrijd", () => {
  assert.deepEqual(buildAlerts([scan("1"), scan("2", { ticketId: "t2" })], ctx), []);
});

test("capaciteit: waarschuwing vanaf 90% en rood bij vol", () => {
  assert.equal(buildAlerts([], { ...ctx, inside: 89, capacity: 100 }).length, 0);
  assert.equal(buildAlerts([], { ...ctx, inside: 90, capacity: 100 })[0].level, "amber");
  assert.equal(buildAlerts([], { ...ctx, inside: 100, capacity: 100 })[0].level, "red");
});

test("drie mislukte pogingen met hetzelfde ticket geeft een rode melding", () => {
  const list = [1, 2, 3].map((i) => scan(`r${i}`, { ticketId: "t1", result: "WARNING", reason: "ALREADY_USED", scannedAt: at(i) }));
  const a = buildAlerts(list, ctx);
  assert.equal(a.length, 1);
  assert.equal(a[0].level, "red");
  assert.equal(buildAlerts(list.slice(0, 2), ctx).length, 0);
});

test("override komt als melding terug met naam en reden", () => {
  const a = buildAlerts([scan("o", { overrideBy: "Pim", overrideReason: "lege telefoon", ticketId: "t9" })], ctx);
  assert.match(a[0].text, /Pim/);
  assert.match(a[0].text, /lege telefoon/);
});

test("vijf onbekende codes binnen tien minuten bij één scanner", () => {
  const fast = [0, 1, 2, 3, 4].map((i) => scan(`n${i}`, { result: "INVALID", reason: "NOT_FOUND", scannerId: "s1", scannedAt: at(i) }));
  assert.match(buildAlerts(fast, ctx)[0].text, /Scanner 1/);
  const slow = [0, 20, 40, 60, 80].map((i) => scan(`m${i}`, { result: "INVALID", reason: "NOT_FOUND", scannerId: "s1", scannedAt: at(i) }));
  assert.equal(buildAlerts(slow, ctx).length, 0);
});

test("tijdlijn telt per kwartier en vult lege kwartieren", () => {
  const t = timeline([scan("a", { scannedAt: at(1) }), scan("b", { scannedAt: at(2) }), scan("c", { scannedAt: at(31) }), scan("d", { result: "INVALID", scannedAt: at(5) })]);
  assert.deepEqual(t.map((x) => x.count), [2, 0, 1]);
  assert.deepEqual(timeline([]), []);
});
