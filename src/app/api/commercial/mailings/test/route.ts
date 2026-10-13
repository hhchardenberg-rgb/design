import { handle } from "@/lib/commercial/api";
import { sendMailingEmail } from "@/lib/mail";
import { sendTestMail } from "@/lib/commercial/mailings.server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { to?: unknown; subject?: unknown; bodyText?: unknown; name?: unknown } | null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return handle((ctx) => sendTestMail(ctx, { to: str(body?.to), subject: str(body?.subject), bodyText: str(body?.bodyText), name: str(body?.name) || null }, sendMailingEmail));
}
