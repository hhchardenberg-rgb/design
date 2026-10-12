import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { createTeam, listTeams } from "@/lib/commercial/teams.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle((ctx) => listTeams(ctx));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: (await createTeam(ctx, z.object({ name: z.string().max(80) }).parse(body).name)).id }));
}
