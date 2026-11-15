import { handleTickets } from "@/lib/tickets/api";
import { listAssets, uploadAsset } from "@/lib/tickets/design/admin.server";
import { ApiError } from "@/lib/api-guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return handleTickets(["design:read"], async () => ({ assets: await listAssets() }));
}

/** Nieuwe afbeelding, of (met assetId) een nieuwe versie van een bestaande. */
export async function POST(req: Request) {
  return handleTickets(["design:edit"], async (actor) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof Blob)) throw new ApiError(400, "Kies een bestand.");
    return uploadAsset(actor, {
      file: Buffer.from(await file.arrayBuffer()),
      name: String(form.get("name") ?? ""),
      kind: String(form.get("kind") ?? "SPONSOR"),
      assetId: (form.get("assetId") as string | null) || null,
      companyId: (form.get("companyId") as string | null) || null,
    });
  });
}
