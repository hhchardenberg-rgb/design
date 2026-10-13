import { handle } from "@/lib/commercial/api";
import { pipelineReport, seasonReport } from "@/lib/commercial/reports.server";
import { ApiError } from "@/lib/api-guards";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const seasonId = new URL(req.url).searchParams.get("seasonId");
  return handle(async (ctx) => {
    if (!seasonId) throw new ApiError(400, "Kies een seizoen.");
    const [season, pipeline] = await Promise.all([seasonReport(ctx, seasonId), pipelineReport(ctx).catch(() => null)]);
    return { season, pipeline };
  });
}
