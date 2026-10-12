import { handle } from "@/lib/commercial/api";
import { saveSeason } from "@/lib/commercial/contracts.server";
import { seasonSchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await saveSeason(ctx, id, seasonSchema.parse(body)) }));
}
