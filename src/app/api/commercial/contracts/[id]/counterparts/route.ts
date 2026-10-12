import { handle } from "@/lib/commercial/api";
import { addCounterpart, listCounterparts } from "@/lib/commercial/contracts.server";
import { counterpartSchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => ({ counterparts: await listCounterparts(ctx, id) }));
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await addCounterpart(ctx, id, counterpartSchema.parse(body)) }));
}
