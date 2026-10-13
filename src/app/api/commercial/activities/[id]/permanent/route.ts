import { handle } from "@/lib/commercial/api";
import { deleteActivity } from "@/lib/commercial/activities.server";

/** Definitief wissen; archiveren gaat via DELETE op /api/commercial/activities/[id]. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => deleteActivity(ctx, id));
}
