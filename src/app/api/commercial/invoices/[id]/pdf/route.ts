import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildRecordCtx } from "@/lib/commercial/ctx.server";
import { documentForPdf } from "@/lib/commercial/invoicing.server";
import { renderDocumentPdf } from "@/lib/commercial/invoice-render";

export const dynamic = "force-dynamic";

/** Pdf van een definitief document, op het briefpapier van de vereniging. Vraagt de downloadbevoegdheid. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireCommercial();
    const ctx = await buildRecordCtx(user);
    const { doc, creditedNumber } = await documentForPdf(ctx, id);
    const pdf = await renderDocumentPdf(doc, creditedNumber);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${doc.number!.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
