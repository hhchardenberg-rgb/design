import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireUserManager } from "@/lib/user-managers.server";
import { deleteAccessRole, updateAccessRole } from "@/lib/access/service.server";
import { roleSchema } from "@/lib/access/schema";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireUserManager();
    const { id } = await params;
    await updateAccessRole(manager.actor, id, roleSchema.parse(await req.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireUserManager();
    const { id } = await params;
    return NextResponse.json(await deleteAccessRole(manager.actor, id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
