import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildRecordCtx } from "@/lib/commercial/ctx.server";
import { exportCompaniesCsv, exportCompanyContactsXlsx, exportContractsCsv } from "@/lib/commercial/reports.server";

export const dynamic = "force-dynamic";

/** CSV-download: ?kind=contracts[&seasonId=…] of ?kind=companies; Excel: ?kind=contacts[&tier=GOUD&tier=NONE…]. */
export async function GET(req: Request) {
  try {
    const { user } = await requireCommercial();
    const ctx = await buildRecordCtx(user);
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    if (kind === "contacts") {
      const xlsx = await exportCompanyContactsXlsx(ctx, url.searchParams.getAll("tier"));
      return new NextResponse(Buffer.from(xlsx), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="sponsoren-contactpersonen-${new Date().toISOString().slice(0, 10)}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }
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
