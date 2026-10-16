import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requireHubAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { templateSchemaJson } from "@/lib/validations/template";
import { loadAssetBuffer } from "@/lib/render/loadAsset";
import { diffBuffers, bufferFromPixels } from "@/lib/psd/compose";
import type { ImportReport } from "@/lib/psd/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vergelijkt de template (zoals hij nu in de builder staat, met de
 * voorbeeldinhoud uit het PSD) met de samengestelde afbeelding van de
 * import. Lagen die in Photoshop verborgen waren, doen niet mee. Geeft de render, een verschilbeeld en het aandeel afwijkende
 * pixels terug.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    await requireHubAdmin();
    const { id, versionId } = await params;
    const version = await prisma.templateVersion.findUnique({ where: { id: versionId }, include: { fields: true } });
    if (!version || version.templateId !== id) throw new ApiError(404, "Versie niet gevonden.");
    const report = version.importReport as unknown as ImportReport | null;
    if (!report?.referenceUrl) throw new ApiError(400, "Deze versie heeft geen PSD-referentie om mee te vergelijken.");

    const body = await req.json().catch(() => ({}));
    const parsed = templateSchemaJson.safeParse(body.schemaJson ?? version.schemaJson);
    if (!parsed.success) throw new ApiError(400, "De templatedefinitie is ongeldig.");
    // Invulbare lagen die in Photoshop verborgen waren, staan niet in de
    // referentie; voor een eerlijke vergelijking hier ook weglaten.
    const hiddenFields = new Set(
      report.layers.filter((l) => l.field && l.notes.includes("verborgen in Photoshop")).map((l) => l.field!)
    );
    const schema = {
      ...parsed.data,
      layers: parsed.data.layers.filter((l) => !("field" in l && l.field && hiddenFields.has(l.field) && l.type !== "background")),
    };

    // Alleen aan/uit- en kleurvelden krijgen hun standaardwaarde; tekst en
    // foto's tonen de voorbeeldinhoud uit het PSD.
    const formData: Record<string, unknown> = {};
    for (const f of version.fields) {
      if (f.type === "CHECKBOX") formData[f.key] = f.defaultValue !== "false";
      if (f.type === "BRAND_COLOR" && f.defaultValue) formData[f.key] = f.defaultValue;
    }
    const { renderDesign } = await import("@/lib/render/serverRender");
    const canvas = await renderDesign(schema, formData, {
      textTransforms: Object.fromEntries(version.fields.map((f) => [f.key, f.textTransform])),
    });
    const renderPng = canvas.toBuffer("image/png");

    const toPixels = async (png: Buffer) => {
      const { data, info } = await sharp(png).resize(schema.width, schema.height, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return bufferFromPixels({ width: info.width, height: info.height, data: new Uint8ClampedArray(data) });
    };
    const reference = await toPixels(await loadAssetBuffer(report.referenceUrl));
    const ours = await toPixels(renderPng);
    const diff = diffBuffers(ours, reference);
    const diffPng = await sharp(diff.image, { raw: { width: schema.width, height: schema.height, channels: 4 } }).png().toBuffer();

    return NextResponse.json({
      changedRatio: diff.changedRatio,
      meanDelta: diff.meanDelta,
      render: `data:image/png;base64,${renderPng.toString("base64")}`,
      diff: `data:image/png;base64,${diffPng.toString("base64")}`,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
