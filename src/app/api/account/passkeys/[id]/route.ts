import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { requireCurrentPassword } from "@/lib/mfa/reauth";

const renameSchema = z.object({ name: z.string().min(1).max(60) });
const deleteSchema = z.object({ password: z.string().min(1) });

async function loadOwnPasskey(userId: string, id: string) {
  const passkey = await prisma.webAuthnCredential.findUnique({ where: { id } });
  if (!passkey || passkey.userId !== userId) throw new ApiError(404, "Passkey niet gevonden.");
  return passkey;
}

/** Een passkey een andere naam geven (geen gevoelige actie — geen her-authenticatie nodig). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await loadOwnPasskey(user.id, id);
    const { name } = renameSchema.parse(await req.json());

    const passkey = await prisma.webAuthnCredential.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, deviceType: true, createdAt: true, lastUsedAt: true },
    });
    return NextResponse.json({ passkey });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/**
 * Een passkey verwijderen — gevoelige actie (opdracht sectie 7:
 * "Verwijderen van de laatste passkey"), hier consequent toegepast op élke
 * passkey, niet alleen de laatste: vereist het huidige wachtwoord.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await loadOwnPasskey(user.id, id);
    const { password } = deleteSchema.parse(await req.json());
    await requireCurrentPassword(user.id, password);

    await prisma.webAuthnCredential.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
