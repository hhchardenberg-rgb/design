import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumePasswordResetToken } from "@/lib/password-reset";
import { apiErrorResponse } from "@/lib/api-guards";
import { assertStrongPassword, PASSWORD_MIN_LENGTH } from "@/lib/password-policy.server";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Wachtwoord moet minimaal ${PASSWORD_MIN_LENGTH} tekens zijn.`),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ongeldige aanvraag." },
      { status: 400 }
    );
  }

  try {
    await assertStrongPassword(parsed.data.password);
  } catch (error) {
    return apiErrorResponse(error);
  }

  const ok = await consumePasswordResetToken(prisma, parsed.data.token, parsed.data.password);
  if (!ok) {
    return NextResponse.json(
      { error: "Deze link is ongeldig, al gebruikt of verlopen. Vraag een nieuwe aan." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
