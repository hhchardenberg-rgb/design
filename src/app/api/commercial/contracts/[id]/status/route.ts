import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { setContractStatus } from "@/lib/commercial/contracts.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ contract: await setContractStatus(ctx, id, z.object({ status: z.enum(["ACTIVE", "ENDED", "CANCELLED"]) }).parse(body).status) }));
}
