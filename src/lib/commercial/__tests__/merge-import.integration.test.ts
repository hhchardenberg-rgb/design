// Integratietest dossiers samenvoegen en importeren. Overgeslagen zonder TEST_DATABASE_URL.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let authz: typeof import("../authz.server");
let ctxMod: typeof import("../ctx.server");
let co: typeof import("../companies.server");
let fl: typeof import("../files.server");
let tk: typeof import("../tasks.server");
let im: typeof import("../import.server");
const cwd = process.cwd();
const scratch = skip ? "" : mkdtempSync(path.join(tmpdir(), "hhc-merge-"));

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@merge.test`, passwordHash: "x", roles: ["HUB"] as never } });
  return { id: u.id, name: key, email: u.email, roles: ["HUB"] };
}
async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: { status?: number }) => e.status === status);
}

before(async () => {
  if (skip) return;
  process.chdir(scratch);
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../service.server");
  authz = await import("../authz.server");
  ctxMod = await import("../ctx.server");
  co = await import("../companies.server");
  fl = await import("../files.server");
  tk = await import("../tasks.server");
  im = await import("../import.server");
  await db.commercialFile.deleteMany();
  await db.commercialTask.deleteMany();
  await db.commercialActivity.deleteMany();
  await db.commercialContact.deleteMany();
  await db.commercialCompany.deleteMany();
  await db.commercialTeam.deleteMany();
  await db.commercialAuditEvent.deleteMany();
  await db.commercialMembership.deleteMany();
  await db.commercialRole.deleteMany();
  await db.user.deleteMany({ where: { email: { endsWith: "@merge.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (skip) return;
  await db.commercialFile.deleteMany();
  await db.$disconnect();
  process.chdir(cwd);
  rmSync(scratch, { recursive: true, force: true });
});

test("samenvoegen verhuist alles, vult aan en respecteert bevoegdheid en bereik", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const mgr = await mkUser("mgr");
  const rel = await mkUser("rel");
  const own = await mkUser("own");
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  await svc.grantMembership(admin, rel.id, await role("relatiebeheerder")); // mag niet archiveren
  await svc.grantMembership(admin, own.id, await role("beheerder"));
  await svc.setMemberScopes(await svc.buildActor(mgr), own.id, { companies: "OWN" });
  const cm = await ctxMod.buildRecordCtx(mgr);
  const cr = await ctxMod.buildRecordCtx(rel);
  const co1 = await ctxMod.buildRecordCtx(own);

  const target = await co.createCompany(cm, { name: "Jansen Bouw", city: "Hardenberg", tags: ["bouw"] });
  const source = await co.createCompany(cm, { name: "Jansen Bouw B.V.", email: "info@jansen.test", kvkNumber: "12345678", tags: ["lokaal"], internalNotes: "Oud dossier" });
  await co.createContact(cm, source.id, { name: "Piet Jansen" });
  await co.createActivity(cm, source.id, { kind: "CALL", nature: "NOTE", summary: "Gebeld", occurredAt: new Date() } as never);
  await tk.createTask(cm, { title: "Terugbellen", companyId: source.id } as never);
  await fl.uploadFile(cm, source.id, { name: "logo.png", data: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(50, 1)]), category: "LOGO" });

  await rejects(co.mergeCompanies(cm, target.id, target.id), 400);
  await rejects(co.mergeCompanies(cr, target.id, source.id), 403); // geen archiveerbevoegdheid
  await rejects(co.mergeCompanies(co1, target.id, source.id), 403); // bereik niet 'alles'

  const moved = await co.mergeCompanies(cm, target.id, source.id);
  assert.deepEqual(moved, { contacts: 1, activities: 1, tasks: 1, files: 1 });
  const t = await db.commercialCompany.findUniqueOrThrow({ where: { id: target.id } });
  assert.equal(t.email, "info@jansen.test"); // aangevuld
  assert.equal(t.city, "Hardenberg"); // eigen waarde blijft
  assert.equal(t.kvkNumber, "12345678");
  assert.deepEqual([...t.tags].sort(), ["bouw", "lokaal"]);
  assert.match(t.internalNotes ?? "", /Oud dossier/);
  const s = await db.commercialCompany.findUniqueOrThrow({ where: { id: source.id } });
  assert.equal(s.mergedIntoId, target.id);
  assert.ok(s.archivedAt);
  assert.equal(await db.commercialContact.count({ where: { companyId: target.id } }), 1);
  assert.equal(await db.commercialContact.count({ where: { companyId: source.id } }), 0);
  assert.equal((await db.commercialAuditEvent.count({ where: { action: "company.merge", entityId: target.id } })), 1);
  await rejects(co.mergeCompanies(cm, target.id, source.id), 409); // al samengevoegd/gearchiveerd
});

test("import: proefrun schrijft niets, dubbelen en fouten worden gemeld, bestaande dossiers blijven", { skip }, async () => {
  const user = await db.user.findFirstOrThrow({ where: { email: "mgr@merge.test" } });
  const cm = await ctxMod.buildRecordCtx({ id: user.id, name: "mgr", email: user.email });
  await co.createCompany(cm, { name: "Bakkerij Smit", city: "Dedemsvaart" });
  const rows = [
    { name: "Nieuwe Sponsor", city: "Hardenberg", status: "actief", tags: "a|b" },
    { name: "bakkerij smit!" }, // zelfde naam na normalisatie
    { name: "Nieuwe Sponsor" }, // dubbel in bestand
    { name: "", city: "x" }, // geen naam
    { name: "Slecht Mail", email: "geen-adres" },
    { name: "Vreemde Status", status: "onbekend" },
    { name: "=HYPERLINK(\"http://x\")", city: "Zwolle" },
  ];
  const before = await db.commercialCompany.count();
  const dry = await im.importCompanies(cm, rows, true);
  assert.equal(await db.commercialCompany.count(), before, "proefrun mag niets opslaan");
  assert.deepEqual([dry.wouldCreate, dry.duplicates, dry.invalid], [2, 2, 3]);
  const real = await im.importCompanies(cm, rows, false);
  assert.equal(real.created, 2);
  assert.equal(await db.commercialCompany.count(), before + 2);
  const nieuw = await db.commercialCompany.findFirstOrThrow({ where: { name: "Nieuwe Sponsor" } });
  assert.equal(nieuw.status, "ACTIVE");
  assert.deepEqual([...nieuw.tags], ["a", "b"]);
  assert.equal(nieuw.source, "Import");
  assert.equal((await db.commercialCompany.findFirstOrThrow({ where: { name: "Bakkerij Smit" } })).city, "Dedemsvaart"); // niet overschreven
  await rejects(im.importCompanies(cm, Array.from({ length: 501 }, (_, i) => ({ name: `X${i}` })), true), 400);
  // Zonder aanmaakbevoegdheid geen import.
  const ro = await db.user.create({ data: { name: "ro", email: "ro@merge.test", passwordHash: "x", roles: ["HUB"] as never } });
  const roleId = (await db.commercialRole.findUniqueOrThrow({ where: { key: "alleen-lezen" } })).id;
  await svc.grantMembership(await svc.buildActor({ id: (await db.user.findFirstOrThrow({ where: { email: "adm@merge.test" } })).id, name: "adm", email: "adm@merge.test", roles: ["ADMIN", "HUB"] }), ro.id, roleId);
  await rejects(im.importCompanies(await ctxMod.buildRecordCtx({ id: ro.id, name: "ro", email: ro.email }), rows, true), 403);
});
