// Integratietest beveiligde bestanden bij sponsordossiers. Overgeslagen zonder TEST_DATABASE_URL.
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
const cwd = process.cwd();
const scratch = skip ? "" : mkdtempSync(path.join(tmpdir(), "hhc-files-"));

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@file.test`, passwordHash: "x", roles: ["HUB"] as never } });
  return { id: u.id, name: key, email: u.email, roles: ["HUB"] };
}
async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: { status?: number }) => e.status === status);
}
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200, 1)]);
const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(100, 2)]);

before(async () => {
  if (skip) return;
  process.chdir(scratch); // lokale opslag schrijft naar ./storage
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../service.server");
  authz = await import("../authz.server");
  ctxMod = await import("../ctx.server");
  co = await import("../companies.server");
  fl = await import("../files.server");
  await db.commercialFile.deleteMany();
  await db.commercialTask.deleteMany();
  await db.commercialActivity.deleteMany();
  await db.commercialContact.deleteMany();
  await db.commercialCompany.deleteMany();
  await db.commercialTeam.deleteMany();
  await db.commercialAuditEvent.deleteMany();
  await db.commercialMembership.deleteMany();
  await db.commercialRole.deleteMany();
  await db.user.deleteMany({ where: { email: { endsWith: "@file.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (skip) return;
  await db.commercialFile.deleteMany();
  await db.$disconnect();
  process.chdir(cwd);
  rmSync(scratch, { recursive: true, force: true });
});

test("bestanden: validatie, versies, bereik, bevoegdheden en audit", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const rel = await mkUser("rel"); // relatiebeheerder: mag uploaden en downloaden
  const lid = await mkUser("lid"); // sponsorcommissielid: ziet bestanden maar mag niet downloaden
  const own = await mkUser("own"); // relatiebeheerder met alleen eigen bereik
  for (const [u, r] of [[rel, "relatiebeheerder"], [lid, "sponsorcommissielid"], [own, "relatiebeheerder"]] as const) {
    await svc.grantMembership(admin, u.id, await role(r));
  }
  await svc.grantMembership(admin, (await mkUser("mgr")).id, await role("beheerder"));
  const mgr = await db.user.findFirstOrThrow({ where: { email: "mgr@file.test" } });
  await svc.setMemberScopes(await svc.buildActor({ id: mgr.id, name: "mgr", email: mgr.email, roles: ["HUB"] }), own.id, { companies: "OWN" });

  const cRel = await ctxMod.buildRecordCtx(rel);
  const cLid = await ctxMod.buildRecordCtx(lid);
  const cOwn = await ctxMod.buildRecordCtx(own);
  const cMgr = await ctxMod.buildRecordCtx({ id: mgr.id, name: "mgr", email: mgr.email });
  const company = await co.createCompany(cRel, { name: "Dossier met bestanden" });

  // Validatie: type, inhoud en grootte.
  await rejects(fl.uploadFile(cRel, company.id, { name: "logo.svg", data: Buffer.from("<svg onload=alert(1)/>"), category: "LOGO" }), 400);
  await rejects(fl.uploadFile(cRel, company.id, { name: "nep.pdf", data: png, category: "OTHER" }), 400); // inhoud past niet bij extensie
  await rejects(fl.uploadFile(cRel, company.id, { name: "leeg.pdf", data: Buffer.alloc(0), category: "OTHER" }), 400);
  await rejects(fl.uploadFile(cRel, company.id, { name: "groot.pdf", data: Buffer.concat([pdf, Buffer.alloc(fl.MAX_FILE_BYTES)]), category: "OTHER" }), 413);
  await rejects(fl.uploadFile(cRel, company.id, { name: "x.pdf", data: pdf, category: "ONBEKEND" }), 400);
  assert.equal(fl.cleanFileName("../../etc/pas\u0000swd.pdf"), "passwd.pdf");

  // Upload en versies.
  const v1 = await fl.uploadFile(cRel, company.id, { name: "contract.pdf", data: pdf, category: "CONTRACT" });
  assert.equal(v1.version, 1);
  assert.equal(JSON.stringify(v1).includes("storageKey"), false, "opslagsleutel mag niet naar buiten");
  const v2 = await fl.uploadFile(cRel, company.id, { name: "contract-def.pdf", data: Buffer.concat([pdf, Buffer.from("x")]), category: "OTHER", replacesId: v1.id });
  assert.equal(v2.version, 2);
  assert.equal(v2.category, "CONTRACT");
  assert.equal(v2.versionGroup, v1.versionGroup);
  const current = await fl.listFiles(cRel, company.id);
  assert.deepEqual(current.map((f) => f.id), [v2.id]);
  const all = await fl.listFiles(cRel, company.id, { history: true });
  assert.equal(all.length, 2);

  // Download: eigen bevoegdheid en audit.
  const dl = await fl.readFileForDownload(cRel, v2.id, false);
  assert.equal(dl.data.length, pdf.length + 1);
  assert.equal(dl.inline, false);
  assert.equal((await fl.readFileForDownload(cRel, v2.id, true)).inline, true);
  await rejects(fl.readFileForDownload(cLid, v2.id, false), 403); // lid mag lezen maar niet downloaden
  assert.equal((await fl.listFiles(cLid, company.id)).length, 1);
  await rejects(fl.uploadFile(cLid, company.id, { name: "a.pdf", data: pdf, category: "OTHER" }), 403);
  assert.ok((await db.commercialAuditEvent.count({ where: { action: "file.download", entityId: v2.id } })) >= 2);

  // Bereik: 'own' ziet het dossier niet en dus ook de bestanden niet.
  await rejects(fl.listFiles(cOwn, company.id), 404);
  await rejects(fl.readFileForDownload(cOwn, v2.id, false), 404);
  await rejects(fl.archiveFile(cOwn, v2.id), 403); // relatiebeheerder mag niet archiveren, ook buiten bereik niet

  // Archiveren: verdwijnt uit lijst en download, blijft in geschiedenis.
  await rejects(fl.archiveFile(cLid, v2.id), 403);
  await rejects(fl.archiveFile(cRel, v2.id), 403);
  await fl.archiveFile(cMgr, v2.id);
  await rejects(fl.readFileForDownload(cRel, v2.id, false), 404);
  assert.ok((await fl.listFiles(cRel, company.id, { history: true })).some((f) => f.id === v2.id));
});
