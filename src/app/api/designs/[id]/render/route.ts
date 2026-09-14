import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getStorage, buildKey } from "@/lib/storage";
import { requireUser, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { renderDesign, encodeCanvas, type ExportFormat } from "@/lib/render/serverRender";
import { templateSchemaJson } from "@/lib/validations/template";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONTENT_TYPES: Record<ExportFormat, string> = {
  PNG: "image/png",
  JPG: "image/jpeg",
  WEBP: "image/webp",
};
const EXTENSIONS: Record<ExportFormat, string> = { PNG: "png", JPG: "jpg", WEBP: "webp" };

/**
 * Stap 4 van de wizard: "Downloaden". Rendert het ontwerp op volledige
 * templateresolutie server-side en slaat het resultaat op (zie
 * MASTERPROMPT sectie 10 en 17).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const format = (String(body.format ?? "PNG").toUpperCase() as ExportFormat) || "PNG";
    if (!CONTENT_TYPES[format]) throw new ApiError(400, "Ongeldig exportformaat.");

    const design = await prisma.generatedDesign.findUnique({
      where: { id },
      include: { templateVersion: true },
    });
    if (!design || design.userId !== user.id) throw new ApiError(404, "Ontwerp niet gevonden.");

    if (!design.templateVersion.exportFormats.includes(format)) {
      throw new ApiError(400, `Formaat ${format} is niet beschikbaar voor deze template.`);
    }

    const schema = templateSchemaJson.parse(design.templateVersion.schemaJson);
    const formData = body.formData ?? (design.formData as Record<string, unknown>);

    const canvas = await renderDesign(schema, formData);
    const buffer = await encodeCanvas(canvas, format);

    const storage = getStorage();
    const stored = await storage.put({
      key: buildKey("exports", user.id, `${nanoid(10)}.${EXTENSIONS[format]}`),
      data: buffer,
      contentType: CONTENT_TYPES[format],
    });

    const updated = await prisma.generatedDesign.update({
      where: { id },
      data: {
        formData,
        status: "COMPLETED",
        exportUrl: stored.url,
        exportFormat: format,
        width: schema.width,
        height: schema.height,
      },
    });

    return NextResponse.json({ design: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
