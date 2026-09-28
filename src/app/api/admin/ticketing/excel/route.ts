import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getStorage, buildKey } from "@/lib/storage";
import { requireTicketingAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

export async function GET() {
  try {
    await requireTicketingAdmin();
    const templates = await prisma.ticketingExcelTemplate.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    });
    return NextResponse.json({ templates });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireTicketingAdmin();
    const form = await req.formData();
    const file = form.get("file");
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const category = String(form.get("category") ?? "").trim();

    if (!(file instanceof File)) throw new ApiError(400, "Geen bestand ontvangen.");
    if (!title) throw new ApiError(400, "Titel is verplicht.");

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) throw new ApiError(400, "Ondersteunde formaten: XLSX, XLS of CSV.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorage();
    const stored = await storage.put({
      key: buildKey("ticketing-excel", `${nanoid(8)}-${file.name}`),
      data: buffer,
      contentType,
    });

    const template = await prisma.ticketingExcelTemplate.create({
      data: {
        title,
        description: description || null,
        category: category || null,
        url: stored.url,
        fileName: file.name,
        fileSize: buffer.byteLength,
      },
    });

    return NextResponse.json({ template });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
