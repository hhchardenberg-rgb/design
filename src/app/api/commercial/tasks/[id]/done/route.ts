import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { setTaskDone } from "@/lib/commercial/tasks.server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle((ctx) => setTaskDone(ctx, id, z.object({ done: z.boolean() }).parse(body).done));
}
