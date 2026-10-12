import { ApiError } from "@/lib/api-guards";
import { createCompany, findDuplicates, COMPANY_STATUSES, type CompanyFields, type CompanyStatus } from "./companies.server";
import { need, type RecordCtx } from "./ctx.server";

export const IMPORT_MAX_ROWS = 500;

/** Velden waaraan een kolom uit het bestand gekoppeld kan worden. */
export const IMPORT_FIELDS = {
  name: "Bedrijfsnaam",
  tradeName: "Handelsnaam",
  status: "Status (prospect, actief, voormalig)",
  street: "Straat en huisnummer",
  postalCode: "Postcode",
  city: "Plaats",
  website: "Website",
  email: "E-mailadres",
  phone: "Telefoon",
  kvkNumber: "KvK-nummer",
  industry: "Branche",
  sponsorCategory: "Sponsorcategorie",
  source: "Bron",
  tags: "Tags (gescheiden door |)",
  internalNotes: "Interne notitie",
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;

const STATUS_ALIASES: Record<string, CompanyStatus> = {
  prospect: "PROSPECT", actief: "ACTIVE", active: "ACTIVE", voormalig: "FORMER", former: "FORMER", oud: "FORMER",
};

export type ImportRowResult =
  | { row: number; outcome: "ok"; name: string }
  | { row: number; outcome: "duplicate"; name: string; message: string }
  | { row: number; outcome: "invalid"; name: string; message: string };

function toFields(raw: Partial<Record<ImportField, string>>): CompanyFields {
  const v = (k: ImportField) => (raw[k] ?? "").trim() || null;
  const statusRaw = (raw.status ?? "").trim().toLowerCase();
  const status = statusRaw ? STATUS_ALIASES[statusRaw] : undefined;
  if (statusRaw && !status) throw new ApiError(400, `Onbekende status “${raw.status}”.`);
  const email = v("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, `Ongeldig e-mailadres “${email}”.`);
  const website = v("website");
  return {
    name: (raw.name ?? "").trim(),
    tradeName: v("tradeName"),
    status,
    street: v("street"),
    postalCode: v("postalCode"),
    city: v("city"),
    website,
    email,
    phone: v("phone"),
    kvkNumber: v("kvkNumber"),
    industry: v("industry"),
    sponsorCategory: v("sponsorCategory"),
    source: v("source") ?? "Import",
    tags: (raw.tags ?? "").split("|").map((t) => t.trim()).filter(Boolean).slice(0, 30),
    internalNotes: v("internalNotes"),
  };
}

/**
 * Importeert dossiers. Met dryRun gebeurt er niets in de database: je krijgt per rij te zien of die
 * zou slagen. Rijen die op een bestaand dossier lijken (naam of KvK) worden nooit stilletjes
 * aangemaakt of overschreven; de zichtbare of verborgen aard van dat dossier lekt niet uit.
 */
export async function importCompanies(ctx: RecordCtx, rows: Partial<Record<ImportField, string>>[], dryRun: boolean) {
  need(ctx, "companies:create");
  if (rows.length === 0) throw new ApiError(400, "Het bestand bevat geen rijen.");
  if (rows.length > IMPORT_MAX_ROWS) throw new ApiError(400, `Importeer maximaal ${IMPORT_MAX_ROWS} rijen per keer.`);
  const results: ImportRowResult[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 2; // rij 1 is de kopregel
    const label = (rows[i].name ?? "").trim();
    try {
      const fields = toFields(rows[i]);
      if (!fields.name) throw new ApiError(400, "Bedrijfsnaam ontbreekt.");
      const key = `${fields.name.toLowerCase()}|${fields.kvkNumber ?? ""}`;
      if (seen.has(key)) {
        results.push({ row: rowNo, outcome: "duplicate", name: fields.name, message: "Komt twee keer voor in dit bestand." });
        continue;
      }
      seen.add(key);
      const dup = await findDuplicates(ctx, { name: fields.name, kvkNumber: fields.kvkNumber });
      if (dup.visible.length > 0 || dup.hiddenCount > 0) {
        results.push({ row: rowNo, outcome: "duplicate", name: fields.name, message: "Er bestaat al een dossier met deze naam of dit KvK-nummer." });
        continue;
      }
      if (!dryRun) await createCompany(ctx, fields);
      results.push({ row: rowNo, outcome: "ok", name: fields.name });
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) results.push({ row: rowNo, outcome: "invalid", name: label, message: e.message });
      else throw e;
    }
  }
  const count = (o: ImportRowResult["outcome"]) => results.filter((r) => r.outcome === o).length;
  return { dryRun, created: dryRun ? 0 : count("ok"), wouldCreate: count("ok"), duplicates: count("duplicate"), invalid: count("invalid"), results };
}

export const IMPORT_STATUS_VALUES = COMPANY_STATUSES;
