import { handle } from "@/lib/commercial/api";
import { createContract } from "@/lib/commercial/contracts.server";
import { contractSchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await createContract(ctx, id, contractSchema.parse(body)) }));
}
