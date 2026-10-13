import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { getReminderSettings, setReminderSettings } from "@/lib/commercial/reminder-settings.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle((ctx) => getReminderSettings(ctx));
}

const schema = z.object({ defaultFrequency: z.string() });

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await setReminderSettings(ctx, schema.parse(body));
  });
}
