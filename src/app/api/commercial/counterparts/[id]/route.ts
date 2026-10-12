import { handle } from "@/lib/commercial/api";
import { updateCounterpart } from "@/lib/commercial/contracts.server";
import { counterpartUpdateSchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await updateCounterpart(ctx, id, counterpartUpdateSchema.parse(body));
  });
}
