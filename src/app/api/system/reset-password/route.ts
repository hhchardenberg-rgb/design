import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * EENMALIGE, TIJDELIJKE beheerroute om het wachtwoord van precies één,
 * hier vast ingecodeerd account te resetten — bewust NIET parametriseerbaar
 * via het request en geeft het nieuwe wachtwoord NIET terug in de respons
 * (dat nieuwe wachtwoord is al buiten deze route om, in de chat, aan de
 * accounteigenaar doorgegeven). Zelfde onderliggende reden als
 * /api/system/clear-login-attempts: DATABASE_URL is write-only. Gebruikt de
 * bestaande LOGIN_RESET_SECRET. Na gebruik weer verwijderen.
 */
const TARGET_EMAIL = "jermaine.ellenkamp@hhc.nl";
const NEW_PASSWORD_HASH = "$2b$12$b7Jw48oPUf3.j.w20Ieb6eaBiI.FKgkf1FlVDAYagBA4t4fxWhh7W";

export async function POST(req: Request) {
  const configuredSecret = process.env.LOGIN_RESET_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "LOGIN_RESET_SECRET is niet ingesteld op de server." },
      { status: 503 }
    );
  }

  const provided = req.headers.get("x-login-reset-secret") ?? "";
  if (!safeEqual(provided, configuredSecret)) {
    return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) {
    return NextResponse.json({ error: "Geen account met dit e-mailadres." }, { status: 404 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: NEW_PASSWORD_HASH } });
  return NextResponse.json({ ok: true });
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
