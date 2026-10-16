import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getStorage, buildKey } from "@/lib/storage";
import { requireHubAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { FontFileError, readFontMetadata } from "@/lib/fonts/metadata";
import { fontMetadataColumns } from "@/lib/fonts/faces.server";

const FORMATS: Record<string, string> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "ttf",
  otf: "otf",
};

// Lettertypebestanden zijn normaliter een paar honderd KB; ruim voldoende
// marge voor grote variable fonts, zonder een onbeperkte serverside buffer
// toe te staan (relevant buiten Vercel, waar de platform-bodylimiet er niet is).
const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  try {
    await requireHubAdmin();
    const fonts = await prisma.font.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ fonts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireHubAdmin();
    const form = await req.formData();
    const file = form.get("file");
    const nameInput = String(form.get("name") ?? "").trim();
    const familyInput = String(form.get("family") ?? "").trim();

    if (!(file instanceof File)) throw new ApiError(400, "Geen lettertype-bestand ontvangen.");
    if (file.size > MAX_BYTES) throw new ApiError(400, `Bestand is te groot (max ${Math.round(MAX_BYTES / (1024 * 1024))}MB).`);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const format = FORMATS[ext];
    if (!format) throw new ApiError(400, "Ondersteunde formaten: WOFF2, WOFF, TTF, OTF.");

    const buffer = Buffer.from(await file.arrayBuffer());
    // Familie, gewicht, stijl en metrics komen uit het bestand zelf; de
    // ingevulde naam is alleen een weergavenaam.
    let meta;
    try {
      meta = readFontMetadata(buffer);
    } catch (error) {
      if (error instanceof FontFileError) throw new ApiError(400, error.message);
      throw error;
    }
    const duplicate = await prisma.font.findFirst({ where: { sha256: meta.sha256 }, select: { name: true } });
    if (duplicate) throw new ApiError(409, `Dit bestand is al geüpload als "${duplicate.name}".`);

    const name = nameInput || meta.fullName || `${meta.family} ${meta.subfamily}`;
    const family = familyInput || meta.family;
    const storage = getStorage();
    const stored = await storage.put({
      key: buildKey("fonts", `${nanoid(8)}-${file.name}`),
      data: buffer,
      contentType: `font/${format}`,
    });

    const font = await prisma.font.create({
      data: { name, family, format, fileUrl: stored.url, ...fontMetadataColumns(meta) },
    });

    return NextResponse.json({ font });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
