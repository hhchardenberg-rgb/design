import { gunzipSync, gzipSync } from "zlib";

/**
 * Databaseback-up als één bestand: gzip van JSON-regels (één regel per tabelrij).
 *
 * Werkt rechtstreeks op de echte Postgres-tabellen (niet via de Prisma-modellen), zodat ook
 * kolommen die (nog) niet in schema.prisma staan meegaan. Postgres zet de waarden zelf om naar
 * JSON (row_to_json) en bij herstel weer terug (json_populate_recordset), dus datums, bedragen,
 * lijsten en binaire velden komen exact terug.
 */

export const FORMAT = "hhc-hub-backup";
export const FORMAT_VERSION = 1;

/**
 * Tijdelijke beveiligingsgegevens: bewust niet in de back-up. Na een herstel zijn ze waardeloos
 * of zelfs ongewenst (een oude, nog geldige resetlink), en ze bevatten IP-adressen.
 */
export const EXCLUDED_TABLES = new Set(["login_attempts", "password_reset_tokens", "webauthn_challenges", "_prisma_migrations"]);

export interface Sql {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<unknown>;
}

export interface TableInfo {
  name: string;
  rows: number;
  columns: string[];
}

export interface BackupHeader {
  type: "header";
  format: typeof FORMAT;
  version: number;
  createdAt: string;
  /** Git-commit van de code die de back-up maakte; herstel met het schema van die versie. */
  commit: string | null;
  environment: string | null;
  tables: TableInfo[];
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function listTables(sql: Sql): Promise<string[]> {
  const rows = await sql.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

async function columnsOf(sql: Sql, table: string): Promise<string[]> {
  const rows = await sql.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    table,
  );
  return rows.map((r) => r.column_name);
}

/** Leest alle tabellen en geeft het gecomprimeerde (nog niet versleutelde) back-upbestand terug. */
export async function dumpDatabase(sql: Sql, meta: { commit?: string | null; environment?: string | null; now?: Date } = {}) {
  const tables = (await listTables(sql)).filter((t) => !EXCLUDED_TABLES.has(t) && !t.startsWith("backup_"));
  const lines: string[] = [];
  const info: TableInfo[] = [];
  for (const table of tables) {
    const columns = await columnsOf(sql, table);
    const rows = await sql.query<{ j: string }>(`SELECT row_to_json(t)::text AS j FROM ${ident(table)} t`);
    for (const r of rows) lines.push(`{"type":"row","t":${JSON.stringify(table)},"r":${r.j}}`);
    info.push({ name: table, rows: rows.length, columns });
  }
  const header: BackupHeader = {
    type: "header",
    format: FORMAT,
    version: FORMAT_VERSION,
    createdAt: (meta.now ?? new Date()).toISOString(),
    commit: meta.commit ?? null,
    environment: meta.environment ?? null,
    tables: info,
  };
  const text = [JSON.stringify(header), ...lines].join("\n") + "\n";
  return { data: gzipSync(Buffer.from(text, "utf8"), { level: 9 }), header };
}

export interface ParsedBackup {
  header: BackupHeader;
  /** Rijen als ruwe JSON-tekst: niet geparsed, zodat grote getallen (bigint) exact blijven. */
  rows: Map<string, string[]>;
}

const ROW_LINE = /^\{"type":"row","t":("(?:[^"\\]|\\.)*"),"r":(.*)\}$/;

export function parseBackup(gz: Buffer): ParsedBackup {
  const text = gunzipSync(gz).toString("utf8");
  const lines = text.split("\n").filter(Boolean);
  const header = JSON.parse(lines[0] ?? "null") as BackupHeader;
  if (!header || header.type !== "header" || header.format !== FORMAT) throw new Error("Onbekend back-upformaat.");
  if (header.version > FORMAT_VERSION) throw new Error(`Back-upversie ${header.version} is nieuwer dan deze code (${FORMAT_VERSION}).`);
  const rows = new Map<string, string[]>(header.tables.map((t) => [t.name, []]));
  for (let i = 1; i < lines.length; i++) {
    const m = ROW_LINE.exec(lines[i]);
    if (!m) throw new Error(`Back-up is beschadigd (regel ${i + 1}).`);
    const table = JSON.parse(m[1]) as string;
    const list = rows.get(table);
    if (!list) throw new Error(`Rij voor onbekende tabel ${table}.`);
    list.push(m[2]);
  }
  for (const t of header.tables) {
    const n = rows.get(t.name)?.length ?? 0;
    if (n !== t.rows) throw new Error(`Back-up is onvolledig: tabel ${t.name} heeft ${n} van de ${t.rows} rijen.`);
  }
  return { header, rows };
}

interface ForeignKey {
  table: string;
  name: string;
  definition: string;
}

/**
 * Zet een back-up terug in een database waarin het schema al staat (prisma db push).
 * De doeltabellen moeten leeg zijn, tenzij `wipe` aan staat: dan worden ze eerst geleegd.
 * Draait in één transactie: lukt één tabel niet, dan blijft de database zoals hij was.
 * Volgorde maakt niet uit: de verwijzingen (foreign keys) gaan tijdelijk uit en worden daarna
 * opnieuw aangemaakt, waarbij Postgres alles controleert.
 */
export async function restoreDatabase(sql: Sql, backup: ParsedBackup, opts: { wipe?: boolean; batchSize?: number } = {}) {
  const present = new Set(await listTables(sql));
  const missing = backup.header.tables.map((t) => t.name).filter((t) => !present.has(t));
  if (missing.length) throw new Error(`Deze tabellen ontbreken in de doeldatabase: ${missing.join(", ")}. Zet eerst het schema klaar (prisma db push) met de code van commit ${backup.header.commit ?? "onbekend"}.`);

  const tables = backup.header.tables.map((t) => t.name);
  for (const t of tables) {
    const [{ n }] = await sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${ident(t)}`);
    if (n > 0 && !opts.wipe) throw new Error(`Tabel ${t} is niet leeg (${n} rijen). Herstel in een lege database, of kies bewust voor leegmaken.`);
  }

  const fks = await sql.query<ForeignKey>(
    `SELECT c.conrelid::regclass::text AS "table", c.conname AS name, pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`,
  );
  for (const fk of fks) await sql.execute(`ALTER TABLE ${fk.table} DROP CONSTRAINT ${ident(fk.name)}`);
  if (opts.wipe) await sql.execute(`TRUNCATE ${tables.map(ident).join(", ")}`);

  const size = opts.batchSize ?? 500;
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const rows = backup.rows.get(t) ?? [];
    for (let i = 0; i < rows.length; i += size) {
      const chunk = `[${rows.slice(i, i + size).join(",")}]`;
      await sql.execute(`INSERT INTO ${ident(t)} SELECT * FROM json_populate_recordset(NULL::${ident(t)}, $1::json)`, chunk);
    }
    counts[t] = rows.length;
  }

  for (const fk of fks) await sql.execute(`ALTER TABLE ${fk.table} ADD CONSTRAINT ${ident(fk.name)} ${fk.definition}`);

  // Tellers (serial/identity) voorbij de hoogste herstelde waarde zetten.
  const seqs = await sql.query<{ tbl: string; col: string; seq: string }>(
    `SELECT t.relname AS tbl, a.attname AS col, pg_get_serial_sequence(quote_ident(t.relname), a.attname) AS seq
       FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_attribute a ON a.attrelid = t.oid
      WHERE n.nspname = 'public' AND t.relkind = 'r' AND a.attnum > 0 AND pg_get_serial_sequence(quote_ident(t.relname), a.attname) IS NOT NULL`,
  );
  for (const s of seqs) {
    await sql.execute(`SELECT setval('${s.seq}', COALESCE((SELECT max(${ident(s.col)}) FROM ${ident(s.tbl)}), 0) + 1, false)`);
  }
  return counts;
}
