import { handle } from "@/lib/commercial/api";
import { planCounterparts } from "@/lib/commercial/contracts.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return handle(async (ctx) =>
    planCounterparts(ctx, { seasonId: sp.get("seasonId") || undefined, status: sp.get("status") || undefined, overdue: sp.get("overdue") === "1" }),
  );
}
