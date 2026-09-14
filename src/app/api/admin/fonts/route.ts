import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getStorage, buildKey } from "@/lib/storage";
import { requireAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";

const FORMATS: Record<string, string> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "ttf",
  otf: "otf",
};

export async function GET() {
  try {
    await requireAdmin();
    const fonts = await prisma.font.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ fonts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get("file");
    const name = String(form.get("name") ?? "").trim();
    const family = String(form.get("family") ?? name).trim();
    const weight = Number(form.get("weight") ?? 400);
    const style = String(form.get("style") ?? "normal");

    if (!(file instanceof File)) throw new ApiError(400, "Geen lettertype-bestand ontvangen.");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const format = FORMATS[ext];
    if (!format) throw new ApiError(400, "Ondersteunde formaten: WOFF2, WOFF, TTF, OTF.");
    if (!name) throw new ApiError(400, "Geef het lettertype een naam.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorage();
    const stored = await storage.put({
      key: buildKey("fonts", `${nanoid(8)}-${file.name}`),
      data: buffer,
      contentType: `font/${format}`,
    });

    const font = await prisma.font.create({
      data: { name, family, weight, style, format, fileUrl: stored.url },
    });

    return NextResponse.json({ font });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
