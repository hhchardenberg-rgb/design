import { NextResponse } from "next/server";
import { readUnsubscribeParams } from "@/lib/commercial/mail-security";
import { recordUnsubscribe } from "@/lib/commercial/mailings.server";

export const dynamic = "force-dynamic";

/**
 * Publiek (geen login): de ondertekende link is het bewijs. Afmelden gebeurt alleen via POST, zodat
 * mailscanners die links ophalen niemand per ongeluk afmelden; de mailprovider gebruikt dezelfde POST voor one-click.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const email = readUnsubscribeParams(url.searchParams.get("e"), url.searchParams.get("t"));
  if (!email) return NextResponse.json({ error: "Deze afmeldlink is ongeldig." }, { status: 400 });
  await recordUnsubscribe(email, "LINK");
  return NextResponse.json({ ok: true });
}
