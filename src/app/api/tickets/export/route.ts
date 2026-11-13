import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireTickets } from "@/lib/tickets/authz.server";
import { buildExport, type ExportFormat, type ExportKind } from "@/lib/tickets/reports.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS: ExportKind[] = ["tickets", "scans", "rapport"];
const FORMATS: ExportFormat[] = ["csv", "xlsx", "pdf"];

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const kind = KINDS.find((k) => k === sp.get("soort"));
    const format = FORMATS.find((f) => f === sp.get("formaat"));
    if (!kind || !format) return NextResponse.json({ error: "Kies een soort export en een formaat." }, { status: 400 });
    const actor = await requireTickets("exports:export");
    const file = await buildExport(actor, kind, format, sp.get("wedstrijd") ?? undefined);
    return new NextResponse(Buffer.from(typeof file.body === "string" ? new TextEncoder().encode(file.body) : file.body), {
      headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="hhc-${file.name}"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
