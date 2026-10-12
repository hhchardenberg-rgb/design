import { handle } from "@/lib/commercial/api";
import { archiveOpportunity, updateOpportunity } from "@/lib/commercial/opportunities.server";
import { opportunityUpdateSchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await updateOpportunity(ctx, id, opportunityUpdateSchema.parse(body));
  });
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => {
    await archiveOpportunity(ctx, id);
  });
}
