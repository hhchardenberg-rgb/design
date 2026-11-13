import { handle } from "@/lib/commercial/api";
import { getDeletedCompany } from "@/lib/commercial/deleted-archive.server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => getDeletedCompany(ctx, id));
}
