import { handle } from "@/lib/commercial/api";
import { archivePackage, savePackage } from "@/lib/commercial/contracts.server";
import { packageSchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await savePackage(ctx, id, packageSchema.parse(body)) }));
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => {
    await archivePackage(ctx, id);
  });
}
