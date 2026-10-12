import { handle } from "@/lib/commercial/api";
import { listOpportunities } from "@/lib/commercial/opportunities.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle((ctx) => listOpportunities(ctx, { companyId: p.get("companyId") || undefined, mine: p.get("mine") === "1", includeClosed: p.get("closed") === "1" }));
}
