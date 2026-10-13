import { handle } from "@/lib/commercial/api";
import { listReminderMutes, removeReminderMute } from "@/lib/commercial/reminder-settings.server";

export const dynamic = "force-dynamic";

/** Voor beheerders: wie welke sponsor op stil zette. */
export async function GET() {
  return handle((ctx) => listReminderMutes(ctx));
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return handle(async (ctx) => {
    await removeReminderMute(ctx, id);
  });
}
