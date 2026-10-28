import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { createPasswordToken } from "@/lib/password-reset";
import { sendWelcomeEmail } from "@/lib/mail";

// Welkomstmail bij een nieuw account. De mail bevat nooit een wachtwoord: de nieuwe gebruiker kiest er zelf een via
// een eenmalige instellink (hetzelfde mechanisme als "wachtwoord vergeten", maar een week geldig).
//
// Previews delen de productiedatabase. Daarom wordt er alleen echt gemaild op productie; elders wordt de mail
// overgeslagen, zodat een test-account in een preview nooit een echte mail naar een echt adres stuurt.

const WELCOME_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Alleen op productie wordt de welkomstmail echt verstuurd. */
export const welcomeMailLive = () => process.env.VERCEL_ENV === "production";

export type WelcomeResult = "sent" | "skipped" | "failed";

export async function sendWelcome(prisma: PrismaClient, user: { id: string; email: string; name: string }): Promise<WelcomeResult> {
  if (!welcomeMailLive()) {
    console.info(`[welkomstmail] overgeslagen buiten productie voor gebruiker ${user.id}`);
    return "skipped";
  }
  try {
    const token = await createPasswordToken(prisma, user.id, "welkomstmail", WELCOME_TOKEN_TTL_MS);
    await sendWelcomeEmail(user.email, user.name, token, new Date(Date.now() + WELCOME_TOKEN_TTL_MS));
    return "sent";
  } catch (error) {
    // Het account bestaat dan al; de beheerder kan de mail later opnieuw sturen vanuit gebruikersbeheer.
    console.error("[welkomstmail] versturen mislukt", error);
    return "failed";
  }
}

/** Onbruikbaar wachtwoord voor een account dat zijn wachtwoord zelf via de welkomstmail kiest. */
export async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("base64url"), 12);
}
