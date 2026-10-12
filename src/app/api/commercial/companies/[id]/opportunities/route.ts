import { handle } from "@/lib/commercial/api";
import { createOpportunity } from "@/lib/commercial/opportunities.server";
import { opportunitySchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await createOpportunity(ctx, id, opportunitySchema.parse(body)) }));
}
