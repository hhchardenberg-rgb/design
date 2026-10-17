import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { addNotificationRecipient, listNotificationRecipients } from "@/lib/commercial/notifications.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle((ctx) => listNotificationRecipients(ctx));
}

const schema = z.object({ userId: z.string().nullish(), email: z.string().max(200).nullish(), name: z.string().max(100).nullish() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await addNotificationRecipient(ctx, schema.parse(body));
  });
}
