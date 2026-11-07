import { handle } from "@/lib/commercial/api";
import { restoreDeletedCompany } from "@/lib/commercial/deleted-archive.server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => restoreDeletedCompany(ctx, id));
}
