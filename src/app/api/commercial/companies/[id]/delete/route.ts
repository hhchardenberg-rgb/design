import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { deleteCompany, deletePreview } from "@/lib/commercial/deleted-archive.server";

export const dynamic = "force-dynamic";

/** Wat er meegaat naar het gesloten archief; voor de bevestigingsvraag. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => deletePreview(ctx, id));
}

const schema = z.object({ confirm: z.literal(true, { message: "Bevestig eerst dat je dit dossier wilt verwijderen." }), reason: z.string().max(500).nullish() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle((ctx) => deleteCompany(ctx, id, schema.parse(body)));
}
