/**
 * Back-upgereedschap voor herstel (draai lokaal, niet op Vercel). Zie docs/back-ups.md.
 *
 *   npm run backup -- inspect <bestand.hhcbak>
 *   npm run backup -- decrypt <bestand.hhcbak> <uit.ndjson>
 *   npm run backup -- restore <bestand.hhcbak> --database-url <postgres-url> [--wipe]
 *   npm run backup -- restore-files --to-dir <map> | --to-blob   (haalt files/ uit de S3-back-up)
 *
 * De sleutel komt uit BACKUP_ENCRYPTION_KEY. Voor restore-files ook de BACKUP_S3_*-variabelen,
 * en bij --to-blob BLOB_READ_WRITE_TOKEN van de (nieuwe) Blob-opslag.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { gunzipSync } from "zlib";
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { decryptBackup, fingerprintHex, parseKey } from "../src/lib/backup/crypto";
import { parseBackup, restoreDatabase, type Sql } from "../src/lib/backup/db";
import { getBackupTarget } from "../src/lib/backup/target.server";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function load(file: string) {
  const key = parseKey(process.env.BACKUP_ENCRYPTION_KEY);
  console.log(`Sleutel ${fingerprintHex(key)}`);
  return decryptBackup(readFileSync(file), key);
}

async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "inspect" && file) {
    const { header, rows } = parseBackup(load(file));
    console.log(`Gemaakt: ${header.createdAt} · omgeving ${header.environment ?? "?"} · commit ${header.commit ?? "?"}`);
    for (const t of header.tables) console.log(`  ${t.name.padEnd(40)} ${String(rows.get(t.name)?.length ?? 0).padStart(7)} rijen`);
    console.log("Bestand is compleet en onbeschadigd.");
    return;
  }
  if (cmd === "decrypt" && file && process.argv[4]) {
    writeFileSync(process.argv[4], gunzipSync(load(file)));
    console.log(`Leesbare kopie geschreven naar ${process.argv[4]}. Let op: dit bestand bevat alle gegevens onversleuteld.`);
    return;
  }
  if (cmd === "restore" && file) {
    const url = arg("--database-url");
    if (!url) throw new Error("Geef --database-url op (bij voorkeur een nieuwe, lege database of Neon-branch).");
    const backup = parseBackup(load(file));
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      const counts = await prisma.$transaction(
        (tx) => {
          const sql: Sql = { query: (q, ...p) => tx.$queryRawUnsafe(q, ...p), execute: (q, ...p) => tx.$executeRawUnsafe(q, ...p) };
          return restoreDatabase(sql, backup, { wipe: process.argv.includes("--wipe") });
        },
        { timeout: 30 * 60_000, maxWait: 60_000 },
      );
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`Hersteld: ${total} rijen in ${Object.keys(counts).length} tabellen.`);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }
  if (cmd === "restore-files") {
    const key = parseKey(process.env.BACKUP_ENCRYPTION_KEY);
    const target = getBackupTarget();
    if (target?.kind !== "s3") throw new Error("Bestanden staan alleen in de S3-back-up; zet de BACKUP_S3_*-variabelen.");
    const dir = arg("--to-dir");
    const toBlob = process.argv.includes("--to-blob");
    if (!dir && !toBlob) throw new Error("Kies --to-dir <map> of --to-blob.");
    const objects = await target.list("files/");
    let n = 0;
    for (const o of objects) {
      const pathname = o.key.slice("files/".length);
      const data = decryptBackup(await target.get(o.key), key);
      if (dir) {
        const out = join(dir, pathname);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, data);
      } else {
        await put(pathname, data, { access: "public", addRandomSuffix: false, allowOverwrite: true });
      }
      if (++n % 50 === 0) console.log(`${n}/${objects.length}`);
    }
    console.log(`${n} bestanden teruggezet.`);
    return;
  }
  console.log(readFileSync(__filename, "utf8").split("*/")[0]);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
