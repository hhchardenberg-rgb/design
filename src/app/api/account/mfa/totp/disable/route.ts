import { audit, ipOf } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { requireCurrentPassword } from "@/lib/mfa/reauth";
import { disableTotp } from "@/lib/mfa/totp-service";

const bodySchema = z.object({ password: z.string().min(1) });

/**
 * Tweestapsverificatie uitschakelen is een gevoelige actie (opdracht
 * sectie 7) — vereist het huidige wachtwoord opnieuw, niet alleen een
 * geldige sessie.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser({ allowMfaSetup: true });
    const { password } = bodySchema.parse(await req.json());
    await requireCurrentPassword(user.id, password);
    await disableTotp(prisma, user.id);
    await audit({ action: "auth.mfa_disabled", actor: user, target: { type: "user", id: user.id, name: user.name }, ip: ipOf(req) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
