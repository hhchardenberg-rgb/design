import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { renewContract } from "@/lib/commercial/contracts.server";

export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await renewContract(ctx, id, z.object({ seasonId: z.string().min(1), startsOn: day, endsOn: day }).parse(body)) }));
}
