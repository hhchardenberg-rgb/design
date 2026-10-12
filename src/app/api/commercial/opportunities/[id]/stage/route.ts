import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { moveStage, STAGES } from "@/lib/commercial/opportunities.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    const b = z.object({ stage: z.enum(STAGES), lostReason: z.string().max(500).nullish() }).parse(body);
    await moveStage(ctx, id, b.stage, b.lostReason);
  });
}
