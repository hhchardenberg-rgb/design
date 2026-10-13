// Integratietest contactpersonen: volgorde, bewerken en de Excel-export per sponsorvorm.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { columnName } from "../xlsx";

test("xlsx: kolomletters", () => {
  assert.deepEqual([0, 25, 26, 27, 51, 52, 701, 702].map(columnName), ["A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
});

const url = process.env.TEST_DATABASE_URL;
const skip = !url;
if (url) process.env.DATABASE_URL = url;

let db: typeof import("@/lib/prisma").prisma;
let svc: typeof import("../service.server");
let authz: typeof import("../authz.server");
let ctxMod: typeof import("../ctx.server");
let co: typeof import("../companies.server");
let rp: typeof import("../reports.server");

async function mkUser(key: string) {
  const u = await db.user.create({ data: { name: key, email: `${key}@contacts.test`, passwordHash: "x", roles: ["HUB"] as never } });
  return { id: u.id, name: key, email: u.email, roles: ["HUB"] };
}
async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: { status?: number }) => e.status === status);
}
/** Leest een werkblad terug als tabel van tekst (alleen inline strings, zoals de export schrijft). */
async function readSheet(file: Uint8Array, n: number): Promise<string[][]> {
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file(`xl/worksheets/sheet${n}.xml`)!.async("string");
  return [...xml.matchAll(/<row r="\d+">(.*?)<\/row>/g)].map((m) => {
    const row: string[] = [];
    for (const c of m[1].matchAll(/<c r="([A-Z]+)\d+"[^>]*><is><t[^>]*>(.*?)<\/t><\/is><\/c>/g)) {
      let i = 0;
      for (const ch of c[1]) i = i * 26 + (ch.charCodeAt(0) - 64);
      row[i - 1] = c[2].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    }
    return Array.from(row, (v) => v ?? "");
  });
}

before(async () => {
  if (skip) return;
  db = (await import("@/lib/prisma")).prisma;
  svc = await import("../service.server");
  authz = await import("../authz.server");
  ctxMod = await import("../ctx.server");
  co = await import("../companies.server");
  rp = await import("../reports.server");
  for (const t of ["commercialActivity", "commercialContact", "commercialCompany", "commercialAuditEvent", "commercialMembership"] as const) {
    await (db[t] as unknown as { deleteMany: (a?: unknown) => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@contacts.test" } } });
  await authz.ensureSystemRoles();
});
after(async () => {
  if (!skip) await db.$disconnect();
});

test("contactpersonen: volgorde, functie en Excel-export per sponsorvorm", { skip }, async () => {
  const role = async (key: string) => (await db.commercialRole.findUniqueOrThrow({ where: { key } })).id;
  const admin = await svc.buildActor({ ...(await mkUser("adm")), roles: ["ADMIN", "HUB"] });
  const mgr = await mkUser("mgr");
  await svc.grantMembership(admin, mgr.id, await role("beheerder"));
  const cm = await ctxMod.buildRecordCtx(mgr);

  const gold = await co.createCompany(cm, { name: "Bakker & Zn", sponsorTier: "GOUD" });
  const main = await co.createCompany(cm, { name: "Smit", sponsorTier: "HOOFD" });
  const none = await co.createCompany(cm, { name: "Zonder" });

  const p1 = await co.createContact(cm, gold.id, { name: "Anna", jobTitle: "Directeur", email: "anna@bakker.nl", phone: "0612345678" });
  const p2 = await co.createContact(cm, gold.id, { name: "Bert", jobTitle: "Marketing" });
  const p3 = await co.createContact(cm, gold.id, { name: "=Cees", jobTitle: "Facturatie", email: "cees@bakker.nl" });
  await co.createContact(cm, main.id, { name: "Dirk", jobTitle: "Eigenaar" });
  await co.createContact(cm, none.id, { name: "Els" });

  // Nieuwe contactpersonen sluiten achteraan aan.
  const order = async (id: string) => (await co.listContacts(cm, id)).map((c) => c.name);
  assert.deepEqual(await order(gold.id), ["Anna", "Bert", "=Cees"]);

  // Volgorde wijzigen; een onvolledige of vreemde lijst wordt geweigerd.
  await co.reorderContacts(cm, gold.id, [p3.id, p1.id, p2.id]);
  assert.deepEqual(await order(gold.id), ["=Cees", "Anna", "Bert"]);
  await rejects(co.reorderContacts(cm, gold.id, [p1.id, p2.id]), 409);
  await rejects(co.reorderContacts(cm, main.id, [p1.id]), 409);

  // Functie wijzigen.
  await co.updateContact(cm, p2.id, { jobTitle: "Commercieel manager" });

  // Export: alle bedrijven, hoogste sponsorvorm eerst, contacten naast elkaar.
  const all = await readSheet(await rp.exportCompanyContactsXlsx(cm), 1);
  assert.deepEqual(all.slice(1).map((r) => r[0]), ["Smit", "Bakker & Zn", "Zonder"]);
  const head = all[0];
  assert.equal(head.indexOf("Contact 3 telefoon"), head.length - 1);
  const bakker = all.find((r) => r[0] === "Bakker & Zn")!;
  const at = (col: string) => bakker[head.indexOf(col)];
  assert.equal(at("Sponsorvorm"), "Goud");
  assert.equal(at("Aantal contactpersonen"), "3");
  assert.equal(at("Contact 1 naam"), "=Cees"); // inline tekst: wordt niet als formule uitgevoerd
  assert.equal(at("Contact 2 naam"), "Anna");
  assert.equal(at("Contact 2 functie"), "Directeur");
  assert.equal(at("Contact 2 e-mail"), "anna@bakker.nl");
  assert.equal(at("Contact 2 telefoon"), "0612345678");
  assert.equal(at("Contact 3 functie"), "Commercieel manager");

  // Tweede blad: één rij per persoon met volgorde.
  const people = await readSheet(await rp.exportCompanyContactsXlsx(cm), 2);
  assert.equal(people.length, 1 + 5);
  assert.deepEqual(people.filter((r) => r[0] === "Bakker & Zn").map((r) => [r[2], r[3]]), [["1", "=Cees"], ["2", "Anna"], ["3", "Bert"]]);

  // Filteren per sponsorvorm, inclusief "zonder vorm".
  const names = async (tiers: string[]) => (await readSheet(await rp.exportCompanyContactsXlsx(cm, tiers), 1)).slice(1).map((r) => r[0]);
  assert.deepEqual(await names(["GOUD"]), ["Bakker & Zn"]);
  assert.deepEqual(await names(["HOOFD", "NONE"]), ["Smit", "Zonder"]);
  assert.deepEqual(await names(["ONZIN"]), ["Smit", "Bakker & Zn", "Zonder"]);

  // Gearchiveerde contactpersonen gaan niet mee.
  await co.archiveContact(cm, p1.id);
  const [h2, row] = await readSheet(await rp.exportCompanyContactsXlsx(cm, ["GOUD"]), 1);
  assert.equal(row[h2.indexOf("Aantal contactpersonen")], "2");
  assert.equal(row[h2.indexOf("Contact 2 naam")], "Bert");

  // Zonder exportrecht geen export.
  const reader = await mkUser("rd");
  await svc.grantMembership(admin, reader.id, await role("alleen-lezen"));
  await rejects(rp.exportCompanyContactsXlsx(await ctxMod.buildRecordCtx(reader)), 403);

  assert.ok(await db.commercialAuditEvent.findFirst({ where: { action: "export.contacts" } }));
});
