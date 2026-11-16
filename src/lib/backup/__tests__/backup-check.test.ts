import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateBackupCheck, type CheckInput, type RunSummary } from "../check";

const now = new Date("2026-11-16T06:00:00Z");
const H = 3_600_000;

function nightly(days: number, skip: number[] = []): RunSummary[] {
  const runs: RunSummary[] = [];
  for (let i = 0; i < days; i++) {
    if (skip.includes(i)) continue;
    runs.push({
      id: `r${i}`,
      status: "OK",
      startedAt: new Date(now.getTime() - 4 * H - i * 24 * H),
      keyId: "aaaa",
      storageKey: `db/${i}.hhcbak`,
      prunedAt: null,
      target: "blob",
      rowCount: 1000,
      tableCount: 50,
      filesPending: null,
    });
  }
  return runs;
}

function input(over: Partial<CheckInput> = {}): CheckInput {
  return {
    now,
    configProblems: [],
    target: "blob",
    mirrorsFiles: false,
    currentKeyId: "aaaa",
    runs: nightly(10),
    restore: { runId: "r0", ok: true, rows: 1000, tables: 50 },
    neon: { configured: true, mainReady: true, historyHours: 6, branchCount: 3 },
    ...over,
  };
}

const item = (r: ReturnType<typeof evaluateBackupCheck>, key: string) => r.items.find((i) => i.key === key);

test("alles in orde geeft ok; externe opslag ontbreekt is alleen info", () => {
  const r = evaluateBackupCheck(input());
  assert.equal(r.status, "ok", JSON.stringify(r.items.filter((i) => i.status !== "ok")));
  assert.equal(item(r, "files")?.status, "info");
  assert.match(item(r, "restore")!.detail, /1\.000 rijen uit 50 tabellen/);
  assert.match(item(r, "neon")!.detail, /6 uur/);
});

test("gemiste nachten worden met datum genoemd", () => {
  const r = evaluateBackupCheck(input({ runs: nightly(10, [2]) }));
  assert.equal(r.status, "warn");
  assert.match(item(r, "week")!.detail, /\d{2}\/\d{2}\/2026/);
  assert.equal(evaluateBackupCheck(input({ runs: nightly(10, [1, 2, 3]) })).status, "fail");
});

test("te oude of geen back-up is een fout", () => {
  const old = nightly(10).map((r) => ({ ...r, startedAt: new Date(r.startedAt.getTime() - 3 * 24 * H) }));
  assert.equal(item(evaluateBackupCheck(input({ runs: old })), "latest")?.status, "fail");
  assert.equal(evaluateBackupCheck(input({ runs: [], restore: null })).status, "fail");
});

test("proefopening die faalt of rijen mist is een fout", () => {
  assert.equal(evaluateBackupCheck(input({ restore: { runId: "r0", ok: false, error: "Verkeerde sleutel" } })).status, "fail");
  assert.equal(evaluateBackupCheck(input({ restore: { runId: "r0", ok: true, rows: 990, tables: 50 } })).status, "fail");
});

test("back-ups met een oude sleutel en een volle Neon geven een waarschuwing", () => {
  const runs = nightly(10).map((r, i) => (i > 5 ? { ...r, keyId: "bbbb" } : r));
  assert.equal(item(evaluateBackupCheck(input({ runs })), "key")?.status, "warn");
  assert.equal(item(evaluateBackupCheck(input({ neon: { configured: true, mainReady: true, historyHours: 6, branchCount: 9 } })), "neon-branches")?.status, "warn");
  assert.equal(item(evaluateBackupCheck(input({ neon: { configured: false } })), "neon")?.status, "info");
});

test("een nieuwe installatie wordt niet afgerekend op nachten van vóór de eerste back-up", () => {
  const r = evaluateBackupCheck(input({ runs: nightly(3) }));
  assert.equal(item(r, "week")?.status, "ok");
});
