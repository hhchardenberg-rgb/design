import { taskSchema } from "@/lib/commercial/schemas";
import { handle, num } from "@/lib/commercial/api";
import { createTask, listTasks } from "@/lib/commercial/tasks.server";

export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle((ctx) =>
    listTasks(ctx, {
      mine: p.get("mine") === "1",
      status: p.get("status") === "DONE" ? "DONE" : p.get("status") === "OPEN" ? "OPEN" : undefined,
      overdue: p.get("overdue") === "1",
      companyId: p.get("companyId") || undefined,
      page: num(p.get("page")),
      pageSize: num(p.get("pageSize")),
    }),
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: (await createTask(ctx, taskSchema.parse(body))).id }));
}
