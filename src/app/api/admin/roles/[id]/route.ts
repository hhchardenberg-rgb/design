import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireUserManager } from "@/lib/user-managers.server";
import { deleteAccessRole, updateAccessRole } from "@/lib/access/service.server";
import { roleSchema } from "@/lib/access/schema";
import { audit, ipOf } from "@/lib/audit";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireUserManager();
    const { id } = await params;
    const input = roleSchema.parse(await req.json());
    await updateAccessRole(manager.actor, id, input);
    await audit({ action: "role.changed", actor: manager.user, target: { type: "role", id, name: input.name }, summary: `Rol aangepast: ${input.name}`, ip: ipOf(req), meta: { input } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireUserManager();
    const { id } = await params;
    const result = await deleteAccessRole(manager.actor, id);
    await audit({ action: "role.changed", actor: manager.user, target: { type: "role", id }, summary: "Rol verwijderd", ip: ipOf(req) });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
