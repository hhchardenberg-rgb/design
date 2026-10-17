import { test } from "node:test";
import assert from "node:assert/strict";
import { collectUploadRefs, decideUpload } from "../cleanup";

const day = 24 * 3600 * 1000;
const now = new Date("2026-11-30T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * day);

test("verwijzingen naar uploads worden gevonden, ook via de URL", () => {
  const ids = new Set<string>();
  const urls = new Set<string>();
  collectUploadRefs({ foto: { asset: { kind: "upload", id: "u1" }, assetUrl: "https://x/u1.png" }, oud: { assetUrl: "https://x/u2.png" }, logo: { asset: { kind: "team", id: "t" } }, naam: "x" }, ids, urls);
  assert.deepEqual([...ids], ["u1"]);
  assert.ok(urls.has("https://x/u2.png"));
});

test("ongebruikte upload: eerst markeren, pas na de wachttijd verwijderen", () => {
  const refs = { ids: new Set<string>(), urls: new Set<string>() };
  const base = { id: "u", url: "https://x/u.png", storageKey: "uploads/u.png" };
  assert.equal(decideUpload({ ...base, createdAt: ago(2), orphanedAt: null }, refs, now), "keep");
  assert.equal(decideUpload({ ...base, createdAt: ago(10), orphanedAt: null }, refs, now), "mark");
  assert.equal(decideUpload({ ...base, createdAt: ago(40), orphanedAt: ago(29) }, refs, now), "keep");
  assert.equal(decideUpload({ ...base, createdAt: ago(40), orphanedAt: ago(30) }, refs, now), "delete");
  assert.equal(decideUpload({ ...base, storageKey: null, createdAt: ago(90), orphanedAt: null }, refs, now), "keep");
});

test("weer gebruikt: markering vervalt", () => {
  const refs = { ids: new Set(["u"]), urls: new Set<string>() };
  assert.equal(decideUpload({ id: "u", url: "x", storageKey: "k", createdAt: ago(90), orphanedAt: ago(20) }, refs, now), "unmark");
  const byUrl = { ids: new Set<string>(), urls: new Set(["x"]) };
  assert.equal(decideUpload({ id: "u", url: "x", storageKey: "k", createdAt: ago(90), orphanedAt: null }, byUrl, now), "keep");
});
