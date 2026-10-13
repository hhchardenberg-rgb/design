import { handle, num } from "@/lib/commercial/api";
import { CONTRACT_STATUSES, listContracts, type ContractStatus } from "@/lib/commercial/contracts.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const status = p.get("status");
  return handle((ctx) =>
    listContracts(ctx, {
      companyId: p.get("companyId") || undefined,
      seasonId: p.get("seasonId") || undefined,
      tiers: p.get("tiers")?.split(",").filter(Boolean),
      status: status && (CONTRACT_STATUSES as readonly string[]).includes(status) ? (status as ContractStatus) : undefined,
      expiringWithinDays: num(p.get("expiring")),
      page: num(p.get("page")),
      pageSize: num(p.get("pageSize")),
    }),
  );
}
