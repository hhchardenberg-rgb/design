import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHubAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { templateFieldInputSchema } from "@/lib/validations/template";
import { activateVersion, updateDraftVersion } from "@/lib/design/template-versions.server";
import { z } from "zod";

const patchSchema = z.object({
  fields: z.array(templateFieldInputSchema).max(200).optional(),
  schemaJson: z.unknown().optional(),
  exportFormats: z.array(z.enum(["PNG", "JPG", "WEBP"])).optional(),
  /** Na opslaan direct activeren (de knop "Opslaan en activeren"). */
  publish: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    await requireHubAdmin();
    const { id, versionId } = await params;
    const version = await prisma.templateVersion.findUnique({
      where: { id: versionId },
      include: { fields: { orderBy: { sortOrder: "asc" } }, template: true },
    });
    if (!version || version.templateId !== id) throw new ApiError(404, "Versie niet gevonden.");
    return NextResponse.json({ version });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/**
 * Bewerkt een conceptversie. Een versie die al actief is (geweest) is
 * onveranderlijk; daarvoor maak je eerst een nieuwe conceptversie
 * (POST /api/admin/templates/[id]/versions).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    await requireHubAdmin();
    const { id, versionId } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "Ongeldige invoer.");
    const body = parsed.data;

    const version = await updateDraftVersion(id, versionId, {
      fields: body.fields,
      schemaJson: body.schemaJson,
      exportFormats: body.exportFormats,
    });
    let warnings: { message: string }[] = [];
    if (body.publish) warnings = (await activateVersion(id, versionId)).warnings;
    return NextResponse.json({ version, warnings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
