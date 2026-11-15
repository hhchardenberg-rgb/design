import { handleTickets } from "@/lib/tickets/api";
import { checkScope, cleanOverrides, requireScope } from "@/lib/tickets/design/admin.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { scopeKey?: string; overrides?: unknown };
  return handleTickets(["design:read"], async () => {
    const ref = requireScope(String(body.scopeKey ?? ""));
    return checkScope(String(body.scopeKey), await cleanOverrides(body.overrides, ref));
  });
}
