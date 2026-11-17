import { handleScan } from "@/lib/tickets/scan-api";
import { recentScansForSupervisor } from "@/lib/tickets/scan.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleScan(req, async (actor) => recentScansForSupervisor(actor, (new URL(req.url).searchParams.get("eventIds") ?? "").split(",").filter(Boolean)));
}
