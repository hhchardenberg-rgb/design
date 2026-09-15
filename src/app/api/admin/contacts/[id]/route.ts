import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse } from "@/lib/api-guards";
import { processAndStoreImage } from "@/lib/uploadImage";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const form = await req.formData();

    const name = form.has("name") ? String(form.get("name")) : undefined;
    const role = form.has("role") ? String(form.get("role")) : undefined;
    const email = form.has("email") ? String(form.get("email")) || null : undefined;
    const phone = form.has("phone") ? String(form.get("phone")) || null : undefined;
    const notes = form.has("notes") ? String(form.get("notes")) || null : undefined;
    const removePhoto = form.get("removePhoto") === "true";
    const file = form.get("photo");

    let photoUrl: string | null | undefined;
    if (file instanceof File && file.size > 0) {
      photoUrl = (await processAndStoreImage(file, { keyPrefix: "contacts" })).url;
    } else if (removePhoto) {
      photoUrl = null;
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: { name, role, email, phone, notes, photoUrl },
    });
    return NextResponse.json({ contact });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.contact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
