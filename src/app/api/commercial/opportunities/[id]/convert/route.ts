import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { convertToContract } from "@/lib/commercial/opportunities.server";

export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ contractId: await convertToContract(ctx, id, z.object({ seasonId: z.string().min(1), startsOn: day, endsOn: day }).parse(body)) }));
}
