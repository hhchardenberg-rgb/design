import { handle } from "@/lib/commercial/api";
import { restoreActivity } from "@/lib/commercial/activities.server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => restoreActivity(ctx, id));
}
