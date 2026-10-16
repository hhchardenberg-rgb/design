import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, ApiError } from "@/lib/api-guards";
import { loadDesign, EXTENSIONS, type ExportFormat } from "@/lib/design/service.server";
import { designErrorResponse } from "@/lib/design/api";
import { loadAssetBuffer } from "@/lib/render/loadAsset";
import { slugify } from "@/lib/psd/naming";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = { PNG: "image/png", JPG: "image/jpeg", WEBP: "image/webp" };

/**
 * Download van precies het bestand dat bij de export is gemaakt (geen
 * nieuwe render), na controle dat de gebruiker het ontwerp mag openen.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; exportId: string }> }) {
  try {
    const user = await requireUser();
    const { id, exportId } = await params;
    const design = await loadDesign(user, id);
    const row = await prisma.designExport.findUnique({ where: { id: exportId } });
    if (!row || row.designId !== design.id) throw new ApiError(404, "Export niet gevonden.");

    const data = await loadAssetBuffer(row.url);
    const base = slugify(design.title ?? design.templateVersion.template.name).replace(/_/g, "-").slice(0, 60);
    const filename = `${base}-${row.width}x${row.height}-r${row.revision}.${EXTENSIONS[row.format as ExportFormat] ?? "png"}`;
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": CONTENT_TYPES[row.format] ?? "application/octet-stream",
        "Content-Length": String(data.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return designErrorResponse(error);
  }
}
