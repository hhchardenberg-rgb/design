import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { applyIndexation, listIndexations, previewIndexation } from "@/lib/commercial/indexation.server";

export const dynamic = "force-dynamic";

const schema = z.object({
  seasonId: z.string().min(1, "Kies een seizoen."),
  basisPoints: z.number().int(),
  roundingCents: z.number().int(),
  apply: z.boolean().optional(),
});

export async function GET() {
  return handle(async (ctx) => ({ runs: await listIndexations(ctx) }));
}

/** Zonder `apply` een voorbeeld, met `apply: true` toepassen. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    const { apply, ...input } = schema.parse(body);
    return apply ? { applied: await applyIndexation(ctx, input) } : previewIndexation(ctx, input);
  });
}
