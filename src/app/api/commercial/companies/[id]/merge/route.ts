import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { mergeCompanies } from "@/lib/commercial/companies.server";

export const dynamic = "force-dynamic";

/** `id` is het dossier dat blijft bestaan; `sourceId` wordt erin samengevoegd. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ moved: await mergeCompanies(ctx, id, z.object({ sourceId: z.string().min(1) }).parse(body).sourceId) }));
}
