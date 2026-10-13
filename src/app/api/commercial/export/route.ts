import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildRecordCtx } from "@/lib/commercial/ctx.server";
import { exportCompaniesCsv, exportContractsCsv } from "@/lib/commercial/reports.server";

export const dynamic = "force-dynamic";

/** CSV-download: ?kind=contracts[&seasonId=…] of ?kind=companies. */
export async function GET(req: Request) {
  try {
    const { user } = await requireCommercial();
    const ctx = await buildRecordCtx(user);
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const csv = kind === "companies" ? await exportCompaniesCsv(ctx) : await exportContractsCsv(ctx, url.searchParams.get("seasonId") || undefined);
    const name = kind === "companies" ? "sponsoren" : "contracten";
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
