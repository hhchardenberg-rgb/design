import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildActor, createRole } from "@/lib/commercial/service.server";

const schema = z.object({
  name: z.string().trim().min(1, "Geef de rol een naam.").max(80),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string()),
});

export async function POST(req: Request) {
  try {
    const { user } = await requireCommercial("rights:manage_rights");
    const body = schema.parse(await req.json());
    const role = await createRole(await buildActor(user), body);
    return NextResponse.json({ role: { id: role.id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
