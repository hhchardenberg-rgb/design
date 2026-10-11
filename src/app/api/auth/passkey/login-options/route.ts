import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import { checkLoginRateLimit, clientIpFrom } from "@/lib/login-rate-limit";
import { startPasskeyLoginOptions } from "@/lib/webauthn/service";

const bodySchema = z.object({ email: z.email() });

/**
 * Genereert WebAuthn-authenticatieopties voor het tweede-factor-pad (ná een
 * correct wachtwoord) — publiek bereikbaar (de gebruiker is op dit moment
 * nog niet ingelogd), maar aan dezelfde rate limit onderworpen als
 * inlogpogingen zelf: anders zou dit endpoint los gebruikt kunnen worden om
 * te testen welke e-mailadressen een passkey hebben, zonder dat mislukte
 * pogingen ergens tegen afgezet worden.
 */
export async function POST(req: Request) {
  try {
    const { email } = bodySchema.parse(await req.json());
    const normalizedEmail = normalizeEmail(email);
    const ip = clientIpFrom(req);

    const rateLimit = await checkLoginRateLimit(prisma, normalizedEmail, ip);
    if (rateLimit.limited) {
      return NextResponse.json({ error: "Te veel pogingen. Probeer het later opnieuw." }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      // Zelfde reden als in auth.ts: geen signaal geven of dit
      // e-mailadres bestaat.
      return NextResponse.json({ error: "Geen passkey beschikbaar voor dit account." }, { status: 404 });
    }

    const options = await startPasskeyLoginOptions(prisma, user.id);
    if (!options) {
      return NextResponse.json({ error: "Geen passkey beschikbaar voor dit account." }, { status: 404 });
    }
    return NextResponse.json(options);
  } catch {
    return NextResponse.json({ error: "Er is iets misgegaan." }, { status: 400 });
  }
}
