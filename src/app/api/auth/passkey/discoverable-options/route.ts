import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startPasswordlessLoginOptions } from "@/lib/webauthn/service";

/**
 * Genereert WebAuthn-authenticatieopties voor volledig wachtwoordloos
 * inloggen (discoverable credential — geen e-mailadres vooraf nodig). Geen
 * gebruiker is hier nog bekend, dus er is ook geen rate-limit-sleutel om
 * op te checken; de beveiliging zit in de handtekeningverificatie zelf
 * (zonder een geregistreerde private key kan geen enkele aanroep hiervan
 * tot een sessie leiden) en in het eenmalig-bruikbare, kort geldige
 * challenge-record.
 */
export async function POST() {
  const options = await startPasswordlessLoginOptions(prisma);
  return NextResponse.json(options);
}
