import { handle } from "@/lib/commercial/api";
import { removeNotificationRecipient } from "@/lib/commercial/notifications.server";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => {
    await removeNotificationRecipient(ctx, id);
  });
}
