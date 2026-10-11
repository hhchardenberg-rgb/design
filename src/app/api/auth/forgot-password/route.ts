import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientIpFrom } from "@/lib/login-rate-limit";
import { requestPasswordReset } from "@/lib/password-reset";

export const runtime = "nodejs";

const bodySchema = z.object({ email: z.string().email() });

const GENERIC_MESSAGE =
  "Als dit e-mailadres bij ons bekend is, is er zojuist een e-mail verstuurd met een link om je wachtwoord te resetten.";

/**
 * Altijd dezelfde respons, ongeacht of het account bestaat, de aanvrager
 * over de limiet zit, of het versturen zelf lukt — anders zou het
 * eindpunt zelf al verraden welke e-mailadressen een account hebben. Zie
 * requestPasswordReset() in src/lib/password-reset.ts voor de eigenlijke
 * logica.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldig e-mailadres." }, { status: 400 });
  }

  const ip = clientIpFrom(req);
  try {
    await requestPasswordReset(prisma, parsed.data.email, ip);
  } catch (error) {
    // Een mislukte e-mailverzending (bv. RESEND_API_KEY nog niet
    // geconfigureerd) mag nooit zichtbaar zijn voor de aanvrager — dat zou
    // hetzelfde enumeratielek zijn als een afwijkend antwoord. Wel loggen
    // voor de beheerder.
    console.error("[forgot-password] versturen mislukt", error);
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
