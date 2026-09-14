import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getStorage, buildKey } from "@/lib/storage";
import { importPsd } from "@/lib/psd/parse";
import { slugify } from "@/lib/psd/naming";
import { loadAssetBuffer } from "@/lib/render/loadAsset";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import type { TemplateSchemaJson } from "@/lib/validations/template";

export const runtime = "nodejs";
export const maxDuration = 60;

interface UploadInput {
  buffer: Buffer;
  name: string;
  category: string;
  templateId: string | null;
}

/**
 * Admin-flow stap 1: PSD uploaden -> automatisch parsen -> Template +
 * (concept) TemplateVersion aanmaken met gedetecteerde velden.
 * De admin komt hierna in de template-builder terecht om de gedetecteerde
 * velden te controleren en te verfijnen (zie /admin/templates/[id]/builder).
 *
 * Twee manieren om het bestand aan te leveren:
 *  - multipart/form-data met een "file" (kleine bestanden / lokale dev)
 *  - JSON met een "psdUrl" die al rechtstreeks (client-side) naar Vercel
 *    Blob is geüpload — nodig omdat PSD's vaak groter zijn dan de 4,5MB
 *    request-bodylimiet van een Vercel serverless function (zie
 *    /api/admin/templates/upload/blob-auth).
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = await parseInput(req);

    const result = await importPsd(input.buffer);
    const { buffer, name, category, templateId } = input;

    const storage = getStorage();
    const importId = nanoid(10);
    const assetPrefix = buildKey("templates", importId);

    const sourcePsd = await storage.put({
      key: buildKey(assetPrefix, "source.psd"),
      data: buffer,
      contentType: "application/octet-stream",
    });
    const background = await storage.put({
      key: buildKey(assetPrefix, "background.png"),
      data: result.backgroundPng,
      contentType: "image/png",
    });

    // Overlay-rasters voor VISIBILITY:*-groepen en placeholders voor
    // IMAGE:*-velden opslaan en URLs terugkoppelen in de laag-definitie.
    const schema: TemplateSchemaJson = structuredClone(result.schema);
    for (const layer of schema.layers) {
      if (layer.type === "background") {
        layer.src = background.url;
      } else if (layer.type === "static_image" && layer.visibilityField) {
        const buf = result.previewByField[`__visibility_${layer.visibilityField}`];
        if (buf) {
          const stored = await storage.put({
            key: buildKey(assetPrefix, `overlay-${layer.visibilityField}.png`),
            data: buf,
            contentType: "image/png",
          });
          layer.src = stored.url;
        }
      } else if (layer.type === "image") {
        const buf = result.previewByField[layer.field];
        if (buf) {
          const stored = await storage.put({
            key: buildKey(assetPrefix, `placeholder-${layer.field}.png`),
            data: buf,
            contentType: "image/png",
          });
          layer.placeholderSrc = stored.url;
        }
      }
    }

    let template = templateId
      ? await prisma.template.findUniqueOrThrow({ where: { id: templateId } })
      : null;

    if (!template) {
      const baseSlug = slugify(name);
      let slug = baseSlug;
      let i = 2;
      while (await prisma.template.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${i++}`;
      }
      template = await prisma.template.create({
        data: {
          slug,
          name,
          category,
          status: "DRAFT",
          createdById: admin.id,
        },
      });
    }

    const lastVersion = await prisma.templateVersion.findFirst({
      where: { templateId: template.id },
      orderBy: { versionNumber: "desc" },
    });
    const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    const version = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        versionNumber,
        status: "DRAFT",
        width: schema.width,
        height: schema.height,
        schemaJson: schema as unknown as object,
        sourcePsdAssetId: (
          await prisma.templateAsset.create({
            data: { kind: "SOURCE_PSD", url: sourcePsd.url },
          })
        ).id,
        assets: {
          create: [{ kind: "BACKGROUND", url: background.url, width: schema.width, height: schema.height }],
        },
        fields: {
          create: result.fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            defaultValue: f.defaultValue ?? undefined,
            placeholder: f.placeholder ?? undefined,
            maxLength: f.maxLength ?? undefined,
            textTransform: f.textTransform,
            options: f.options ?? undefined,
            imageFit: f.imageFit ?? undefined,
            imageAspectRatio: f.imageAspectRatio ?? undefined,
            allowTransparency: f.allowTransparency,
            sortOrder: f.sortOrder,
          })),
        },
      },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json({
      template,
      version,
      warnings: result.warnings,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function parseInput(req: NextRequest): Promise<UploadInput> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json();
    const psdUrl = String(body.psdUrl ?? "");
    const name = String(body.name ?? "").trim();
    const category = String(body.category ?? "Overig").trim();
    const templateId = body.templateId ? String(body.templateId) : null;

    if (!psdUrl) throw new ApiError(400, "Geen PSD-URL ontvangen.");
    if (!name && !templateId) throw new ApiError(400, "Geef een naam voor de template op.");

    const buffer = await loadAssetBuffer(psdUrl);
    return { buffer, name, category, templateId };
  }

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "Overig").trim();
  const templateId = form.get("templateId") ? String(form.get("templateId")) : null;

  if (!(file instanceof File)) {
    throw new ApiError(400, "Geen PSD-bestand ontvangen.");
  }
  if (!file.name.toLowerCase().endsWith(".psd")) {
    throw new ApiError(400, "Upload een .psd-bestand.");
  }
  if (!name && !templateId) {
    throw new ApiError(400, "Geef een naam voor de template op.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return { buffer, name, category, templateId };
}
