import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { processAndStoreImage } from "@/lib/uploadImage";

export async function GET() {
  try {
    await requireAdmin();
    const contacts = await prisma.contact.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return NextResponse.json({ contacts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const role = String(form.get("role") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    const file = form.get("photo");

    if (!name || !role) throw new ApiError(400, "Naam en functie zijn verplicht.");

    const photoUrl = file instanceof File && file.size > 0 ? (await processAndStoreImage(file, { keyPrefix: "contacts" })).url : null;

    const contact = await prisma.contact.create({
      data: { name, role, email: email || null, phone: phone || null, notes: notes || null, photoUrl },
    });
    return NextResponse.json({ contact });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
