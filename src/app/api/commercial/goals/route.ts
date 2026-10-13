import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { getGoals, setGoals } from "@/lib/commercial/goals.server";
import { ApiError } from "@/lib/api-guards";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const seasonId = new URL(req.url).searchParams.get("seasonId");
  return handle(async (ctx) => {
    if (!seasonId) throw new ApiError(400, "Kies een seizoen.");
    return getGoals(ctx, seasonId);
  });
}

const putSchema = z.object({
  seasonId: z.string().min(1),
  goals: z.array(z.object({ tier: z.string(), targetCents: z.number().int().nullable() })).max(20),
});

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    const input = putSchema.parse(body);
    await setGoals(ctx, input.seasonId, input.goals);
    return { ok: true };
  });
}
