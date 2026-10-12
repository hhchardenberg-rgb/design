import { handle } from "@/lib/commercial/api";
import { listSeasons, saveSeason } from "@/lib/commercial/contracts.server";
import { seasonSchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async (ctx) => ({ seasons: await listSeasons(ctx) }));
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await saveSeason(ctx, null, seasonSchema.parse(body)) }));
}
