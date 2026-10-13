import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, requireUser } from "@/lib/api-guards";
import { getProfile, updateProfile } from "@/lib/profile.server";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().optional(),
  phone: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  notifyCommercialDigest: z.boolean().optional(),
  commercialDigestFrequency: z.string().nullable().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await getProfile(user.id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Controleer de ingevulde gegevens.");
    const body = parsed.data;
    await updateProfile(user.id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
