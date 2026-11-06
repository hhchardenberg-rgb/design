import { audit, ipOf } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { confirmTotpEnrollment } from "@/lib/mfa/totp-service";

const bodySchema = z.object({ code: z.string().regex(/^\d{6}$/, "Vul een zescijferige code in.") });

/** Stap 2: bevestigt de setup met de huidige code uit de Authenticator-app en activeert TOTP. */
export async function POST(req: Request) {
  try {
    const user = await requireUser({ allowMfaSetup: true });
    const { code } = bodySchema.parse(await req.json());
    const { recoveryCodes } = await confirmTotpEnrollment(prisma, user.id, code);
    await audit({ action: "auth.mfa_enabled", actor: user, target: { type: "user", id: user.id, name: user.name }, ip: ipOf(req) });
    return NextResponse.json({ ok: true, recoveryCodes });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
