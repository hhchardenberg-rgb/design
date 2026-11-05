import { audit, ipOf } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { requireUser, apiErrorResponse } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { finishPasskeyRegistration } from "@/lib/webauthn/service";

const bodySchema = z.object({
  name: z.string().min(1).max(60),
  response: z.looseObject({}),
});

/** Stap 2: verifieert het antwoord van `navigator.credentials.create()` en slaat de passkey op. */
export async function POST(req: Request) {
  try {
    const user = await requireUser({ allowMfaSetup: true });
    const { name, response } = bodySchema.parse(await req.json());
    await finishPasskeyRegistration(prisma, user.id, response as unknown as RegistrationResponseJSON, name);
    await audit({ action: "auth.passkey_added", actor: user, target: { type: "user", id: user.id, name: user.name }, ip: ipOf(req) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
