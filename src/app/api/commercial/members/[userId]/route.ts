import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildActor, setMemberPermissions, setMemberRole } from "@/lib/commercial/service.server";

const schema = z
  .object({
    roleId: z.string().nullable().optional(),
    permissions: z.array(z.string()).optional(),
  })
  .strict();

export async function PUT(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { user } = await requireCommercial("rights:manage_rights");
    const { userId } = await params;
    const body = schema.parse(await req.json());
    const actor = await buildActor(user);
    // Eerst de rol, daarna de individuele uitzonderingen (die gelden t.o.v. de nieuwe rol).
    if (body.roleId !== undefined) await setMemberRole(actor, userId, body.roleId);
    if (body.permissions) await setMemberPermissions(await buildActor(user), userId, body.permissions);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
