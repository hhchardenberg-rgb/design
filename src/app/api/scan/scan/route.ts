import { handleScan } from "@/lib/tickets/scan-api";
import { processScan } from "@/lib/tickets/scan.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleScan(req, async (actor) => processScan(actor, await req.json()));
}
