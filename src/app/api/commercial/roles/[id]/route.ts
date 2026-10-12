import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildActor, updateRole } from "@/lib/commercial/service.server";

const schema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    permissions: z.array(z.string()).optional(),
  })
  .strict();

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireCommercial("rights:manage_rights");
    const { id } = await params;
    const body = schema.parse(await req.json());
    await updateRole(await buildActor(user), id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
