import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { importCompanies, IMPORT_FIELDS } from "@/lib/commercial/import.server";

export const dynamic = "force-dynamic";

const fieldKeys = Object.keys(IMPORT_FIELDS) as [string, ...string[]];
const bodySchema = z.object({
  dryRun: z.boolean(),
  rows: z.array(z.record(z.enum(fieldKeys), z.string().max(2000).optional())).max(500),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    const { rows, dryRun } = bodySchema.parse(body);
    return importCompanies(ctx, rows, dryRun);
  });
}
