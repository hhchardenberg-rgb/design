import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, requireUser } from "@/lib/api-guards";
import { changePassword } from "@/lib/profile.server";

const schema = z.object({ current: z.string(), next: z.string() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Controleer de ingevulde gegevens.");
    const body = parsed.data;
    await changePassword(user.id, body.current, body.next);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
