import { handle } from "@/lib/commercial/api";
import { bannersForCompany, saveBanner } from "@/lib/tickets/banner.server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => bannersForCompany(ctx, id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle((ctx) => saveBanner(ctx, id, null, body));
}
