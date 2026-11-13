import { handleScan } from "@/lib/tickets/scan-api";
import { syncScans } from "@/lib/tickets/scan.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  return handleScan(req, async (actor) => syncScans(actor, await req.json()));
}
