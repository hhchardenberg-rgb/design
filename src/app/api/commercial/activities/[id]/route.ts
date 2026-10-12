import { handle } from "@/lib/commercial/api";
import { archiveActivity } from "@/lib/commercial/companies.server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => archiveActivity(ctx, id));
}
