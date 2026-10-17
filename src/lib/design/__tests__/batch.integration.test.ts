// Integratietest fase C: formaatvarianten, batchproductie met ZIP en
// opruimen van ongebruikte uploads. Overgeslagen zonder TEST_DATABASE_URL.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
process.env.STORAGE_DRIVER = "local";

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let tv: typeof import("../template-versions.server");
let batch: typeof import("../batch.server");
let cleanupSvc: typeof import("../cleanup.server");
let storage: typeof import("@/lib/storage");
const cwd = process.cwd();
const scratch = skip ? "" : mkdtempSync(path.join(tmpdir(), "hhc-batch-"));
const SUFFIX = "@batch.test";

async function mkUser(key: string, roles: string[]) {
  const u = await db.user.create({ data: { name: key, email: `${key}${SUFFIX}`, passwordHash: "x", roles: roles as never } });
  return { id: u.id, roles: roles as never };
}

async function png(color: string, w = 40, h = 30) {
  return sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer();
}

async function mkUpload(userId: string) {
  const stored = await storage.getStorage().put({ key: `uploads/${userId}/${Math.random().toString(36).slice(2)}.png`, data: await png("#3366ff"), contentType: "image/png" });
  return db.uploadedAsset.create({ data: { userId, url: stored.url, storageKey: stored.key, kind: "PHOTO", width: 40, height: 30 } });
}

/** Gepubliceerde template met een tegenstander-, foto- en (optioneel verplicht) spelersveld. */
async function mkTemplate(slug: string, opts: { width?: number; height?: number; familyKey?: string; requirePlayer?: boolean } = {}) {
  const width = opts.width ?? 200;
  const height = opts.height ?? 150;
  const bg = await storage.getStorage().put({ key: `templates/${slug}/background.png`, data: await png("#ffffff", width, height), contentType: "image/png" });
  const schema = {
    width,
    height,
    backgroundColor: "#ffffff",
    layers: [
      { id: "background", type: "background", x: 0, y: 0, width, height, src: bg.url },
      { id: "photo", type: "image", field: "photo", x: 10, y: 10, width: 80, height: 60, fit: "cover", shape: "rect", cornerRadius: 0 },
      { id: "opponent", type: "text", field: "opponent", x: 100, y: 10, width: 90, height: 40, fontFamily: "Inter", fontSize: 9, text: "Tegenstander" },
      { id: "speler", type: "text", field: "speler", x: 100, y: 60, width: 90, height: 40, fontFamily: "Inter", fontSize: 9, text: "" },
    ],
  };
  const template = await db.template.create({ data: { slug, name: "Test " + slug, category: "Wedstrijd", status: "DRAFT", familyKey: opts.familyKey } });
  const version = await db.templateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: 1,
      width,
      height,
      schemaJson: schema,
      fields: {
        create: [
          { key: "opponent", label: "Tegenstander", type: "SHORT_TEXT", maxLength: 60, sortOrder: 0 },
          { key: "photo", label: "Foto", type: "IMAGE", sortOrder: 1 },
          { key: "speler", label: "Speler", type: "SHORT_TEXT", required: !!opts.requirePlayer, sortOrder: 2 },
        ],
      },
    },
  });
  await tv.activateVersion(template.id, version.id);
  return { template, version };
}

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { endsWith: SUFFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.designBatch.deleteMany({ where: { userId: { in: ids } } });
  await db.generatedDesign.deleteMany({ where: { userId: { in: ids } } });
  await db.uploadedAsset.deleteMany({ where: { userId: { in: ids } } });
  await db.template.updateMany({ where: { slug: { startsWith: "btest-" } }, data: { activeVersionId: null } });
  await db.template.deleteMany({ where: { slug: { startsWith: "btest-" } } });
  await db.match.deleteMany({ where: { team: { club: { name: "Batchtest club" } } } });
  await db.club.deleteMany({ where: { name: "Batchtest club" } });
  await db.opponent.deleteMany({ where: { name: { startsWith: "Batchtest " } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  if (skip) return;
  symlinkSync(path.join(cwd, "public"), path.join(scratch, "public"));
  process.chdir(scratch);
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../service.server");
  tv = await import("../template-versions.server");
  batch = await import("../batch.server");
  cleanupSvc = await import("../cleanup.server");
  storage = await import("@/lib/storage");
  await cleanup();
});

after(async () => {
  if (skip) return;
  await cleanup();
  await db.$disconnect();
  process.chdir(cwd);
  rmSync(scratch, { recursive: true, force: true });
});

test("formaten: invoer gaat mee naar een ander formaat van dezelfde familie", { skip }, async () => {
  const user = await mkUser("fam", ["HUB"]);
  const feed = await mkTemplate("btest-feed", { familyKey: "Btest wedstrijd" });
  const story = await mkTemplate("btest-story", { familyKey: "Btest wedstrijd", width: 150, height: 266 });
  const other = await mkTemplate("btest-los");
  const upload = await mkUpload(user.id);
  const design = await svc.createDesign(user, {
    templateVersionId: feed.version.id,
    formData: { opponent: "Katwijk", photo: { asset: { kind: "upload", id: upload.id }, panX: 12, panY: 4, scale: 1.5 } },
  });

  const { design: variant, slug } = await svc.createFormatVariant(user, design.id, story.template.id);
  assert.equal(slug, "btest-story");
  const data = variant.formData as Record<string, { panX?: number; scale?: number } | string>;
  assert.equal(data.opponent, "Katwijk");
  assert.deepEqual([(data.photo as { panX: number }).panX, (data.photo as { scale: number }).scale], [0, 1]);
  assert.equal(variant.templateVersionId, story.version.id);

  await assert.rejects(svc.createFormatVariant(user, design.id, other.template.id), (e: { status?: number }) => e.status === 404);
  const stranger = await mkUser("fam2", ["HUB"]);
  await assert.rejects(svc.createFormatVariant(stranger, design.id, story.template.id), (e: { status?: number }) => e.status === 404);
});

test("batch: per wedstrijd en formaat een ontwerp, export en één ZIP; mislukte opnieuw", { skip }, async () => {
  const user = await mkUser("batch", ["HUB"]);
  const club = await db.club.create({ data: { name: "Batchtest club", isOwnClub: true } });
  const team = await db.team.create({ data: { clubId: club.id, name: "Batchtest 1" } });
  const opponents = await Promise.all(["Batchtest Katwijk", "Batchtest Quick"].map((name) => db.opponent.create({ data: { name } })));
  const matches = await Promise.all(
    opponents.map((o, i) => db.match.create({ data: { teamId: team.id, opponentId: o.id, isHome: i === 0, date: new Date(Date.UTC(2026, 10, 1 + i, 13)) } }))
  );
  const feed = await mkTemplate("btest-bfeed", { familyKey: "Btest batch" });
  const story = await mkTemplate("btest-bstory", { familyKey: "Btest batch", width: 150, height: 266 });

  await assert.rejects(
    batch.createBatch(user, { templateIds: [feed.template.id], source: "match", sourceIds: Array.from({ length: 61 }, (_, i) => `m${i}`), format: "PNG" }),
    /Maximaal 60/
  );

  const created = await batch.createBatch(user, {
    templateIds: [feed.template.id, story.template.id],
    source: "match",
    sourceIds: matches.map((m) => m.id),
    format: "PNG",
  });
  let state = await batch.runBatch(user, created.id);
  assert.equal(state.status, "DONE", JSON.stringify(state.items.map((i) => i.error)));
  assert.equal(state.items.length, 4);
  assert.ok(state.items.every((i) => i.status === "DONE" && i.designId && i.exportId), JSON.stringify(state.items.map((i) => [i.status, i.error])));
  assert.match(state.items[0].label, /Batchtest 1 - Batchtest Katwijk 01\/11\/2026/);

  const designs = await db.generatedDesign.findMany({ where: { id: { in: state.items.map((i) => i.designId!) } } });
  assert.deepEqual(new Set(designs.map((d) => (d.formData as { opponent: string }).opponent)), new Set(["Batchtest Katwijk", "Batchtest Quick"]));
  assert.ok(designs.every((d) => d.matchId));

  const zip = await JSZip.loadAsync(await storage.getStorage().get(state.zipKey!));
  const names = Object.keys(zip.files).sort();
  assert.equal(names.length, 4);
  assert.ok(names.every((n) => n.endsWith(".png")), names.join(","));

  // Een template met een verplicht veld dat de wedstrijd niet vult: inhoudelijke fout, niet herhaald.
  const strict = await mkTemplate("btest-strict", { requirePlayer: true });
  const failing = await batch.createBatch(user, { templateIds: [strict.template.id], source: "match", sourceIds: [matches[0].id], format: "PNG" });
  state = await batch.runBatch(user, failing.id);
  assert.equal(state.status, "FAILED");
  assert.equal(state.items[0].status, "FAILED");
  assert.equal(state.items[0].attempts, 1);
  assert.match(state.items[0].error ?? "", /Speler/);

  // Na aanvullen van de standaardwaarde lukt opnieuw proberen.
  await db.templateField.updateMany({ where: { templateVersionId: strict.version.id, key: "speler" }, data: { defaultValue: "Jan" } });
  await db.designBatchItem.updateMany({ where: { batchId: failing.id }, data: { designId: null } });
  await batch.retryBatch(user, failing.id);
  state = await batch.runBatch(user, failing.id);
  assert.equal(state.status, "DONE");

  const other = await mkUser("batch2", ["HUB"]);
  await assert.rejects(batch.runBatch(other, created.id), (e: { status?: number }) => e.status === 404);
});

test("opruimen: ongebruikte upload eerst gemarkeerd, na de wachttijd weg; gebruikte blijft", { skip }, async () => {
  const user = await mkUser("clean", ["HUB"]);
  const t = await mkTemplate("btest-clean");
  const used = await mkUpload(user.id);
  const unused = await mkUpload(user.id);
  await svc.createDesign(user, { templateVersionId: t.version.id, formData: { photo: { asset: { kind: "upload", id: used.id } } } });
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  await db.uploadedAsset.updateMany({ where: { id: { in: [used.id, unused.id] } }, data: { createdAt: old } });

  await cleanupSvc.runDesignCleanup();
  const marked = await db.uploadedAsset.findUniqueOrThrow({ where: { id: unused.id } });
  assert.ok(marked.orphanedAt);
  assert.equal((await db.uploadedAsset.findUniqueOrThrow({ where: { id: used.id } })).orphanedAt, null);

  // Na 31 dagen nog steeds ongebruikt: record en bestand weg.
  await cleanupSvc.runDesignCleanup(new Date(Date.now() + 31 * 24 * 3600 * 1000));
  assert.equal(await db.uploadedAsset.findUnique({ where: { id: unused.id } }), null);
  assert.equal(existsSync(path.join(scratch, "storage", unused.storageKey!)), false);
  assert.ok(await db.uploadedAsset.findUnique({ where: { id: used.id } }));
});
