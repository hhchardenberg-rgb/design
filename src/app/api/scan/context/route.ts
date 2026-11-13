import { handleScan } from "@/lib/tickets/scan-api";
import { scanContext } from "@/lib/tickets/scan.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleScan(req, (actor) => scanContext(actor));
}
