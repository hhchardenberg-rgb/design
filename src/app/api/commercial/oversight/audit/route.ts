import { handle, num } from "@/lib/commercial/api";
import { listAuditLog } from "@/lib/commercial/oversight.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return handle((ctx) =>
    listAuditLog(ctx, {
      actorId: sp.get("actorId") || undefined,
      actionPrefix: sp.get("actionPrefix") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      page: num(sp.get("page"), 1),
    }),
  );
}
