import { handle } from "@/lib/commercial/api";
import { sendMailingEmail } from "@/lib/mail";
import { sendMailing } from "@/lib/commercial/mailings.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => sendMailing(ctx, id, sendMailingEmail));
}
