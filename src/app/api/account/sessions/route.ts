import { NextResponse } from "next/server";
import { apiErrorResponse, requireUser } from "@/lib/api-guards";
import { audit, ipOf } from "@/lib/audit";
import { bumpSessionVersion } from "@/lib/auth-state.server";

/** Uitloggen op alle apparaten: elke bestaande sessie van dit account vervalt. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser({ allowMfaSetup: true });
    await bumpSessionVersion(user.id);
    await audit({ action: "auth.logout_all", actor: user, target: { type: "user", id: user.id, name: user.name }, ip: ipOf(req) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
