import { NextResponse } from "next/server";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { prisma } from "@/lib/prisma";
import { startPasskeyRegistration } from "@/lib/webauthn/service";

/** Stap 1: genereert de WebAuthn-registratieopties voor `navigator.credentials.create()`. */
export async function POST() {
  try {
    const user = await requireUser();
    if (!user.email) throw new ApiError(400, "Account heeft geen e-mailadres.");
    const options = await startPasskeyRegistration(prisma, user.id, user.email);
    return NextResponse.json(options);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
