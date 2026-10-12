import { handle } from "@/lib/commercial/api";
import { archiveFile } from "@/lib/commercial/files.server";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => {
    await archiveFile(ctx, id);
  });
}
