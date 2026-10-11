import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { requireCurrentPassword } from "@/lib/mfa/reauth";
import { hasTotpEnabled } from "@/lib/mfa/totp-service";
import { generateRecoveryCodes } from "@/lib/mfa/recovery-codes";

const bodySchema = z.object({ password: z.string().min(1) });

/**
 * Nieuwe herstelcodes genereren (en de oude daarmee ongeldig maken) —
 * gevoelige actie, vereist het huidige wachtwoord opnieuw (opdracht
 * sectie 6/7).
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { password } = bodySchema.parse(await req.json());
    await requireCurrentPassword(user.id, password);

    if (!(await hasTotpEnabled(prisma, user.id))) {
      throw new ApiError(409, "Tweestapsverificatie is niet actief — er zijn geen herstelcodes om te vernieuwen.");
    }

    const recoveryCodes = await generateRecoveryCodes(prisma, user.id);
    return NextResponse.json({ recoveryCodes });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
