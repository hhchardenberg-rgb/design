import { NextResponse } from "next/server";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { hasTotpEnabled } from "@/lib/mfa/totp-service";
import { countRemainingRecoveryCodes } from "@/lib/mfa/recovery-codes";

/** Overzicht voor de "Accountbeveiliging"-pagina: wat is er actief. */
export async function GET() {
  try {
    const user = await requireUser();
    const [totpEnabled, recoveryCodesRemaining] = await Promise.all([
      hasTotpEnabled(prisma, user.id),
      countRemainingRecoveryCodes(prisma, user.id),
    ]);
    return NextResponse.json({ totpEnabled, recoveryCodesRemaining });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
