import { handle } from "@/lib/commercial/api";
import { getContract, updateContract } from "@/lib/commercial/contracts.server";
import { contractUpdateSchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => ({ contract: await getContract(ctx, id) }));
}
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ contract: await updateContract(ctx, id, contractUpdateSchema.parse(body)) }));
}
