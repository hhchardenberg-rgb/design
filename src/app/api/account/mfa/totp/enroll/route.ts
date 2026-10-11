import { NextResponse } from "next/server";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { startTotpEnrollment } from "@/lib/mfa/totp-service";

/** Stap 1: genereert een nieuw TOTP-geheim en de QR-code om te scannen. */
export async function POST() {
  try {
    const user = await requireUser();
    if (!user.email) throw new ApiError(400, "Account heeft geen e-mailadres.");
    const { secret, qrCodeDataUrl } = await startTotpEnrollment(prisma, user.id, user.email);
    // Het geheim zelf ook los teruggeven (naast de QR-code) voor gebruikers
    // die het handmatig willen invoeren i.p.v. scannen — gangbare UX voor
    // Authenticator-apps.
    return NextResponse.json({ secret, qrCodeDataUrl });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
