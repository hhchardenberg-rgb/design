import { handle } from "@/lib/commercial/api";
import { personOverview } from "@/lib/commercial/oversight.server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return handle((ctx) => personOverview(ctx, userId));
}
