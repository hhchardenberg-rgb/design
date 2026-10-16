// Integratietest ontwerpen: rechten, invoer, afbeeldingen, revisies, export
// en onveranderlijke templateversies. Overgeslagen zonder TEST_DATABASE_URL.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;
process.env.STORAGE_DRIVER = "local";

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let tv: typeof import("../template-versions.server");
let storage: typeof import("@/lib/storage");
const cwd = process.cwd();
const scratch = skip ? "" : mkdtempSync(path.join(tmpdir(), "hhc-design-"));
const SUFFIX = "@design.test";

async function rejects(p: Promise<unknown>, status: number, pattern?: RegExp) {
  await assert.rejects(p, (e: { status?: number; message?: string }) => {
    assert.equal(e.status, status, e.message);
    if (pattern) assert.match(e.message ?? "", pattern);
    return true;
  });
}

async function mkUser(key: string, roles: string[]) {
  const u = await db.user.create({ data: { name: key, email: `${key}${SUFFIX}`, passwordHash: "x", roles: roles as never } });
  return { id: u.id, roles: roles as never };
}

async function png(color: string) {
  return sharp({ create: { width: 40, height: 30, channels: 4, background: color } }).png().toBuffer();
}

async function mkUpload(userId: string) {
  const stored = await storage.getStorage().put({ key: `uploads/${userId}/${Math.random().toString(36).slice(2)}.png`, data: await png("#3366ff"), contentType: "image/png" });
  return db.uploadedAsset.create({ data: { userId, url: stored.url, storageKey: stored.key, kind: "PHOTO", width: 40, height: 30 } });
}

async function mkTemplate(slug: string) {
  const bg = await storage.getStorage().put({ key: `templates/${slug}/background.png`, data: await png("#ffffff"), contentType: "image/png" });
  const schema = {
    width: 200,
    height: 150,
    backgroundColor: "#ffffff",
    layers: [
      { id: "background", type: "background", x: 0, y: 0, width: 200, height: 150, src: bg.url },
      { id: "photo", type: "image", field: "photo", x: 10, y: 10, width: 80, height: 60, fit: "cover", shape: "rect", cornerRadius: 0 },
      { id: "opponent", type: "text", field: "opponent", x: 100, y: 10, width: 90, height: 40, fontFamily: "Inter", fontSize: 20, text: "Tegenstander" },
    ],
  };
  const template = await db.template.create({ data: { slug, name: "Test " + slug, category: "Wedstrijd", status: "DRAFT" } });
  const version = await db.templateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: 1,
      width: 200,
      height: 150,
      schemaJson: schema,
      fields: {
        create: [
          { key: "opponent", label: "Tegenstander", type: "SHORT_TEXT", required: true, maxLength: 30, sortOrder: 0 },
          { key: "photo", label: "Foto", type: "IMAGE", sortOrder: 1 },
          { key: "score_home", label: "Score thuis", type: "SCORE", sortOrder: 2 },
        ],
      },
    },
  });
  return { template, version, schema };
}

async function cleanup() {
  const users = await db.user.findMany({ where: { email: { endsWith: SUFFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.generatedDesign.deleteMany({ where: { userId: { in: ids } } });
  await db.uploadedAsset.deleteMany({ where: { userId: { in: ids } } });
  await db.template.deleteMany({ where: { slug: { startsWith: "dtest-" } } });
  await db.opponent.deleteMany({ where: { name: "Testclub Designtest" } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  if (skip) return;
  symlinkSync(path.join(cwd, "public"), path.join(scratch, "public"));
  process.chdir(scratch); // lokale opslag schrijft naar ./storage
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../service.server");
  tv = await import("../template-versions.server");
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

test("activeren: alleen binnen de eigen template en zonder kritieke fouten", { skip }, async () => {
  const a = await mkTemplate("dtest-act-a");
  const b = await mkTemplate("dtest-act-b");
  await rejects(tv.activateVersion(b.template.id, a.version.id), 404);

  await db.templateVersion.update({
    where: { id: a.version.id },
    data: { schemaJson: { ...a.schema, layers: [...a.schema.layers, { id: "x", type: "text", field: "bestaat_niet", x: 0, y: 0, width: 10, height: 10, fontSize: 10 }] } },
  });
  await rejects(tv.activateVersion(a.template.id, a.version.id), 400, /onbekende veld/);

  await db.templateVersion.update({ where: { id: a.version.id }, data: { schemaJson: a.schema } });
  const res = await tv.activateVersion(a.template.id, a.version.id);
  assert.equal(res.template.activeVersionId, a.version.id);
});

test("templateversies: na activeren onveranderlijk, aanpassen via nieuwe conceptversie", { skip }, async () => {
  const t = await mkTemplate("dtest-lock");
  await tv.updateDraftVersion(t.template.id, t.version.id, { exportFormats: ["PNG"] });
  await rejects(tv.updateDraftVersion(t.template.id, t.version.id, { schemaJson: { width: 0 } }), 400);
  await tv.activateVersion(t.template.id, t.version.id);
  await rejects(tv.updateDraftVersion(t.template.id, t.version.id, { exportFormats: ["PNG", "JPG"] }), 409);

  const draft = await tv.createDraftFromVersion(t.template.id, t.version.id);
  assert.equal(draft.versionNumber, 2);
  const fields = await db.templateField.findMany({ where: { templateVersionId: draft.id } });
  assert.equal(fields.length, 3);
  await tv.updateDraftVersion(t.template.id, draft.id, { exportFormats: ["PNG", "JPG"] });
  const original = await db.templateVersion.findUniqueOrThrow({ where: { id: t.version.id } });
  assert.deepEqual(original.exportFormats, ["PNG"], "de eerder actieve versie is niet aangeraakt");
});

test("ontwerpen: rechten, invoervalidatie en afbeeldingsautorisatie", { skip }, async () => {
  const t = await mkTemplate("dtest-rights");
  await tv.activateVersion(t.template.id, t.version.id);
  const anna = await mkUser("anna", ["HUB"]);
  const bert = await mkUser("bert", ["HUB"]);
  const ticket = await mkUser("ticket", ["TICKETING"]);
  const beheer = await mkUser("beheer", ["HUB_ADMIN"]);

  await rejects(svc.createDesign(ticket, { templateVersionId: t.version.id }), 403);

  const bertUpload = await mkUpload(bert.id);
  const annaUpload = await mkUpload(anna.id);
  const opponent = await db.opponent.create({ data: { name: "Testclub Designtest", logoUrl: annaUpload.url.replace("uploads", "opponents") } });

  // Andermans upload, via id of via URL, is geen toegestane afbeelding.
  await rejects(svc.createDesign(anna, { templateVersionId: t.version.id, formData: { photo: { asset: { kind: "upload", id: bertUpload.id } } } }), 400, /niet \(meer\) beschikbaar/);
  await rejects(svc.createDesign(anna, { templateVersionId: t.version.id, formData: { photo: { assetUrl: bertUpload.url } } }), 400);
  await rejects(svc.createDesign(anna, { templateVersionId: t.version.id, formData: { photo: { assetUrl: "https://evil.example/x.png" } } }), 400);
  // Layout via formData overschrijven kan niet.
  await rejects(svc.createDesign(anna, { templateVersionId: t.version.id, formData: { layers: [] } }), 400, /Onbekend veld/);

  const design = await svc.createDesign(anna, {
    templateVersionId: t.version.id,
    formData: { opponent: "Sparta", photo: { asset: { kind: "upload", id: annaUpload.id }, assetUrl: "https://evil.example/spoof.png", scale: 1.5 } },
  });
  const photo = (design.formData as Record<string, { assetUrl: string }>).photo;
  assert.equal(photo.assetUrl, annaUpload.url, "de URL komt uit het record, niet uit de request");

  // Clubmedia mag iedereen met toegang gebruiken; oude ontwerpen met alleen een URL worden herkend.
  const saved = await svc.saveDesign(anna, design.id, { baseRevision: 1, formData: { opponent: "Sparta", photo: { assetUrl: opponent.logoUrl! } } });
  assert.deepEqual((saved.formData as Record<string, { asset: unknown }>).photo.asset, { kind: "opponent", id: opponent.id });

  // Bert kan Anna's ontwerp niet zien of wijzigen; een beheerder wel.
  await rejects(svc.loadDesign(bert, design.id), 404);
  await rejects(svc.saveDesign(bert, design.id, { baseRevision: 2, formData: {} }), 404);
  assert.equal((await svc.loadDesign(beheer, design.id)).id, design.id);
});

test("ontwerpen: revisieconflict en export van precies de opgeslagen revisie", { skip }, async () => {
  const t = await mkTemplate("dtest-export");
  await tv.activateVersion(t.template.id, t.version.id);
  const anna = await mkUser("anna2", ["HUB"]);

  const design = await svc.createDesign(anna, { templateVersionId: t.version.id, formData: { score_home: "0" } });
  assert.equal(design.revision, 1);
  await rejects(svc.exportDesign(anna, design.id, { revision: 1, format: "PNG" }), 400, /Tegenstander/);

  const r2 = await svc.saveDesign(anna, design.id, { baseRevision: 1, formData: { opponent: "Sparta", score_home: "0" } });
  assert.equal(r2.revision, 2);
  // Een tweede tab die nog op revisie 1 bouwt, mag revisie 2 niet terugzetten.
  await assert.rejects(svc.saveDesign(anna, design.id, { baseRevision: 1, formData: { opponent: "Oud" } }), (e: unknown) => {
    assert.ok(e instanceof svc.DesignConflictError);
    assert.equal(e.current.revision, 2);
    return true;
  });

  // Export van een oudere revisie dan opgeslagen: weigeren in plaats van stil oude inhoud leveren.
  await rejects(svc.exportDesign(anna, design.id, { revision: 1, format: "PNG" }), 409);

  const [e1, e2] = await Promise.all([
    svc.exportDesign(anna, design.id, { revision: 2, format: "PNG" }),
    svc.exportDesign(anna, design.id, { revision: 2, format: "PNG" }),
  ]);
  assert.equal(e1.export.id, e2.export.id, "twee klikken leveren één bestand op");
  assert.equal(await db.designExport.count({ where: { designId: design.id } }), 1);
  assert.equal(e1.export.width, 200);
  const meta = await sharp(await storage.getStorage().get(e1.export.storageKey)).metadata();
  assert.equal(meta.width, 200);
  assert.equal(meta.height, 150);
  assert.equal(meta.format, "png");

  const jpg = await svc.exportDesign(anna, design.id, { revision: 2, format: "JPG" });
  assert.notEqual(jpg.export.id, e1.export.id);
  assert.equal((await sharp(await storage.getStorage().get(jpg.export.storageKey)).metadata()).format, "jpeg");

  // Na een nieuwe revisie ontstaat een nieuw bestand; het oude blijft bestaan.
  await svc.saveDesign(anna, design.id, { baseRevision: 2, formData: { opponent: "Ajax", score_home: "0" } });
  const e3 = await svc.exportDesign(anna, design.id, { revision: 3, format: "PNG" });
  assert.notEqual(e3.export.id, e1.export.id);
  assert.ok(await db.designExport.findUnique({ where: { id: e1.export.id } }));
});

test("export: ontbrekende afbeelding levert geen gedeeltelijk bestand op", { skip }, async () => {
  const t = await mkTemplate("dtest-broken");
  await tv.activateVersion(t.template.id, t.version.id);
  const anna = await mkUser("anna3", ["HUB"]);
  const upload = await mkUpload(anna.id);
  const design = await svc.createDesign(anna, { templateVersionId: t.version.id, formData: { opponent: "X", photo: { asset: { kind: "upload", id: upload.id } } } });
  await storage.getStorage().delete(upload.storageKey!);
  await rejects(svc.exportDesign(anna, design.id, { revision: 1, format: "PNG" }), 422, /geen bestand/);
  assert.equal(await db.designExport.count({ where: { designId: design.id } }), 0);
});

test("ontwerpen: nieuwe templateversie raakt bestaande ontwerpen niet; overstappen maakt een kopie", { skip }, async () => {
  const t = await mkTemplate("dtest-switch");
  await tv.activateVersion(t.template.id, t.version.id);
  const anna = await mkUser("anna4", ["HUB"]);
  const design = await svc.createDesign(anna, { templateVersionId: t.version.id, formData: { opponent: "Sparta", score_home: "3" } });

  const draft = await tv.createDraftFromVersion(t.template.id, t.version.id);
  await db.templateField.deleteMany({ where: { templateVersionId: draft.id, key: "score_home" } });
  await tv.activateVersion(t.template.id, draft.id);

  // Nieuwe ontwerpen kunnen alleen nog op de actieve versie.
  await rejects(svc.createDesign(anna, { templateVersionId: t.version.id }), 404);
  // Het bestaande ontwerp blijft op zijn eigen versie en kan nog worden opgeslagen.
  const saved = await svc.saveDesign(anna, design.id, { baseRevision: 1, formData: { opponent: "Sparta 2", score_home: "3" } });
  assert.equal(saved.templateVersionId, t.version.id);

  const plan = await svc.planVersionSwitch(anna, design.id);
  assert.deepEqual(plan.report.carried, ["Tegenstander"]);
  assert.deepEqual(plan.report.dropped, ["Score thuis"]);
  const switched = await svc.switchDesignVersion(anna, design.id);
  assert.equal(switched.design.templateVersionId, draft.id);
  assert.deepEqual(switched.design.formData, { opponent: "Sparta 2" });
  const original = await db.generatedDesign.findUniqueOrThrow({ where: { id: design.id } });
  assert.equal(original.templateVersionId, t.version.id, "het origineel blijft bestaan");
});
