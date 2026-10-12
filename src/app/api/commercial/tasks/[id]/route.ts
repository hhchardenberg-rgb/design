import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { updateTask } from "@/lib/commercial/tasks.server";
import { taskSchema } from "@/lib/commercial/schemas";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const schema = taskSchema.omit({ companyId: true }).partial().extend({ version: z.number().int().min(1) });
  return handle((ctx) => updateTask(ctx, id, schema.parse(body)));
}
