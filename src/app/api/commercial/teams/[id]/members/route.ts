import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { setTeamMembers } from "@/lib/commercial/teams.server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle((ctx) => setTeamMembers(ctx, id, z.object({ userIds: z.array(z.string()) }).parse(body).userIds));
}
