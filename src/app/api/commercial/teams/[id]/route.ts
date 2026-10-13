import { handle } from "@/lib/commercial/api";
import { deleteTeam } from "@/lib/commercial/teams.server";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => deleteTeam(ctx, id));
}
