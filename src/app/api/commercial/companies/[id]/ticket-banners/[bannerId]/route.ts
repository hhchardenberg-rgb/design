import { handle } from "@/lib/commercial/api";
import { deleteBanner, saveBanner } from "@/lib/tickets/banner.server";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; bannerId: string }> }) {
  const { id, bannerId } = await params;
  const body = await req.json().catch(() => null);
  return handle((ctx) => saveBanner(ctx, id, bannerId, body));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; bannerId: string }> }) {
  const { id, bannerId } = await params;
  return handle((ctx) => deleteBanner(ctx, id, bannerId));
}
