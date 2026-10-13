import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/commercial/mail-security";
import { applyMailEvent } from "@/lib/commercial/mailings.server";

export const dynamic = "force-dynamic";

/** Webhook van Resend (Svix-handtekening). Dicht zonder RESEND_WEBHOOK_SECRET; verwerking is idempotent per gebeurtenis. */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook niet geconfigureerd." }, { status: 503 });
  const body = await req.text();
  const id = req.headers.get("svix-id");
  const ok = verifyWebhookSignature({ secret, id, timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"), body });
  if (!ok || !id) return NextResponse.json({ error: "Ongeldige handtekening." }, { status: 401 });
  let event: { type?: string; data?: { email_id?: string; to?: string[]; bounce?: { type?: string } } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Ongeldige inhoud." }, { status: 400 });
  }
  if (!event.type) return NextResponse.json({ error: "Ongeldige inhoud." }, { status: 400 });
  return NextResponse.json(await applyMailEvent(id, { type: event.type, data: event.data }));
}
