import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildActor, setMemberPermissions, setMemberScopes } from "@/lib/commercial/service.server";

const schema = z
  .object({
    permissions: z.array(z.string()).optional(),
    scopes: z.object({ companies: z.enum(["OWN", "TEAM", "ALL"]).optional(), tasks: z.enum(["OWN", "TEAM", "ALL"]).optional() }).optional(),
  })
  .strict();

export async function PUT(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { user } = await requireCommercial("rights:manage_rights");
    const { userId } = await params;
    const body = schema.parse(await req.json());
    const actor = await buildActor(user);
    // Rollen wijs je toe bij Gebruikers en rechten; hier alleen de persoonlijke uitzonderingen en het bereik.
    if (body.permissions) await setMemberPermissions(actor, userId, body.permissions);
    if (body.scopes) await setMemberScopes(await buildActor(user), userId, body.scopes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
