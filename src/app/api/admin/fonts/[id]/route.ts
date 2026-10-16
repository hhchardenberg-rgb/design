import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHubAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { refreshFontMetadata, versionsUsingFont } from "@/lib/fonts/faces.server";
import { FontFileError } from "@/lib/fonts/metadata";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireHubAdmin();
    const { id } = await params;
    const body = await req.json();
    if (body.refreshMetadata) {
      try {
        const font = await refreshFontMetadata(id);
        return NextResponse.json({ font });
      } catch (error) {
        if (error instanceof FontFileError) throw new ApiError(400, error.message);
        throw error;
      }
    }
    const font = await prisma.font.update({
      where: { id },
      data: { isActive: Boolean(body.isActive) },
    });
    return NextResponse.json({ font });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireHubAdmin();
    const { id } = await params;
    const font = await prisma.font.findUnique({ where: { id } });
    if (!font) throw new ApiError(404, "Lettertype niet gevonden.");
    // Een font dat een templateversie gebruikt blijft bestaan; zet het
    // eventueel uit. Anders zouden bestaande ontwerpen anders gaan tekenen.
    const users = await versionsUsingFont(font);
    if (users.length > 0) {
      const names = [...new Set(users.map((v) => `${v.template.name} v${v.versionNumber}`))].slice(0, 5).join(", ");
      throw new ApiError(409, `Dit lettertype wordt gebruikt door ${names}. Zet het uit in plaats van het te verwijderen.`);
    }
    await prisma.font.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
