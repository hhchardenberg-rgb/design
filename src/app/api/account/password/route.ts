import { audit, ipOf } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, requireUser } from "@/lib/api-guards";
import { changePassword } from "@/lib/profile.server";

const schema = z.object({ current: z.string(), next: z.string() });

export async function POST(req: Request) {
  try {
    const user = await requireUser({ allowMfaSetup: true });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Controleer de ingevulde gegevens.");
    const body = parsed.data;
    await changePassword(user.id, body.current, body.next);
    await audit({ action: "auth.password_changed", actor: user, target: { type: "user", id: user.id, name: user.name }, ip: ipOf(req) });
    // Het wachtwoord is gewijzigd: alle sessies (ook deze) vervallen; de client logt opnieuw in.
    return NextResponse.json({ ok: true, loggedOut: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
