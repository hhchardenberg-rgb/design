import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildRecordCtx } from "@/lib/commercial/ctx.server";
import { documentForPdf } from "@/lib/commercial/invoicing.server";
import { buildInvoicePdf } from "@/lib/commercial/invoice-pdf";

export const dynamic = "force-dynamic";

/** Pdf van een definitief document, op het briefpapier van de vereniging. Vraagt de downloadbevoegdheid. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireCommercial();
    const ctx = await buildRecordCtx(user);
    const { doc, creditedNumber } = await documentForPdf(ctx, id);
    const supplier = (doc.supplierSnapshot ?? {}) as Record<string, string | null>;
    const pdf = await buildInvoicePdf({
      kind: doc.kind as "INVOICE" | "CREDIT_NOTE", number: doc.number!, issuedOn: doc.issuedOn!.toISOString().slice(0, 10), dueOn: doc.dueOn ? doc.dueOn.toISOString().slice(0, 10) : null,
      deliveryText: doc.deliveryText, reference: doc.reference, creditedNumber, buyerName: doc.buyerName, buyerAddress: doc.buyerAddress, buyerVatNumber: doc.buyerVatNumber,
      supplier: { legalName: supplier.legalName ?? null, street: supplier.street ?? null, postalCode: supplier.postalCode ?? null, city: supplier.city ?? null, kvkNumber: supplier.kvkNumber ?? null, vatNumber: supplier.vatNumber ?? null, iban: supplier.iban ?? null },
      lines: doc.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitCents: l.unitCents, vatRateBp: l.vatRateBp })),
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${doc.number!.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
