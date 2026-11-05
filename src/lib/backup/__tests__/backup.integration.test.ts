// Integratietest back-up en herstel. Overgeslagen zonder TEST_DATABASE_URL en TEST_RESTORE_DATABASE_URL
// (twee databases met hetzelfde schema; de tweede wordt leeggemaakt).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { decryptBackup, encryptBackup } from "../crypto";
import { dumpDatabase, parseBackup, restoreDatabase, type Sql } from "../db";

const srcUrl = process.env.TEST_DATABASE_URL;
const dstUrl = process.env.TEST_RESTORE_DATABASE_URL;
const skip = !srcUrl || !dstUrl;

const sqlOf = (c: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]): Sql => ({
  query: (q, ...p) => (c as PrismaClient).$queryRawUnsafe(q, ...p),
  execute: (q, ...p) => (c as PrismaClient).$executeRawUnsafe(q, ...p),
});

test("volledige back-up terugzetten levert identieke tabellen op", { skip }, async () => {
  const src = new PrismaClient({ datasources: { db: { url: srcUrl } } });
  const dst = new PrismaClient({ datasources: { db: { url: dstUrl } } });
  try {
    // Lastige waarden: binaire sleutel, groot getal, lijst, JSON, aanhalingstekens en emoji.
    const user = await src.user.create({
      data: { name: `Test "O'Brien" 🏑 ${Date.now()}`, email: `backup-${Date.now()}@test.nl`, passwordHash: "x", roles: ["HUB", "TICKETING"] },
    });
    await src.webAuthnCredential.create({ data: { userId: user.id, credentialId: `cred-${Date.now()}`, publicKey: randomBytes(77), counter: 3, transports: ["usb"], deviceType: "singleDevice", name: "Sleutel" } as never });
    await src.totpCredential.create({ data: { userId: user.id, encryptedSecret: "a:b:c", lastUsedStep: BigInt("9007199254740993") } as never });
    await src.loginAttempt.create({ data: { email: user.email, ip: "1.2.3.4", success: false } });

    const key = randomBytes(32);
    const { data, header } = await src.$transaction((tx) => dumpDatabase(sqlOf(tx), { commit: "test" }));
    assert.ok(!header.tables.some((t) => t.name === "login_attempts"), "inlogpogingen horen niet in de back-up");
    const parsed = parseBackup(decryptBackup(encryptBackup(data, key), key));

    await dst.$transaction((tx) => restoreDatabase(sqlOf(tx), parsed, { wipe: true }), { timeout: 120_000 });

    for (const t of header.tables) {
      const q = `SELECT coalesce(md5(string_agg(row_to_json(x)::text, '|' ORDER BY row_to_json(x)::text)), '') AS h, count(*)::int AS n FROM "${t.name}" x`;
      const [a] = await src.$queryRawUnsafe<{ h: string; n: number }[]>(q);
      const [b] = await dst.$queryRawUnsafe<{ h: string; n: number }[]>(q);
      assert.equal(b.n, a.n, `${t.name}: aantal rijen`);
      assert.equal(b.h, a.h, `${t.name}: inhoud`);
    }
    const back = await dst.totpCredential.findUnique({ where: { userId: user.id } });
    assert.equal(back?.lastUsedStep, BigInt("9007199254740993"));

    // Verwijzingen zijn na herstel weer actief.
    await assert.rejects(dst.webAuthnCredential.create({ data: { userId: "bestaat-niet", credentialId: `x-${Date.now()}`, publicKey: Buffer.from([1]), deviceType: "x", name: "x" } as never }));
    // Een niet-lege database wordt zonder 'wipe' geweigerd.
    await assert.rejects(dst.$transaction((tx) => restoreDatabase(sqlOf(tx), parsed)), /niet leeg/);

    await src.user.delete({ where: { id: user.id } });
  } finally {
    await src.$disconnect();
    await dst.$disconnect();
  }
});
