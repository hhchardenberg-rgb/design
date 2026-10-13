import { buildInvoicePdf } from "@/lib/commercial/invoice-pdf";

interface RenderableDoc {
  kind: string;
  number: string | null;
  issuedOn: Date | null;
  dueOn: Date | null;
  deliveryText: string | null;
  reference: string | null;
  buyerName: string;
  buyerAddress: string | null;
  buyerVatNumber: string | null;
  supplierSnapshot: unknown;
  lines: { description: string; quantity: number; unitCents: number; vatRateBp: number | null }[];
}

/** Pdf van een definitief document, opgebouwd uit de vastgelegde gegevens (niet uit de huidige instellingen). */
export function renderDocumentPdf(doc: RenderableDoc, creditedNumber: string | null): Promise<Buffer> {
  const supplier = (doc.supplierSnapshot ?? {}) as Record<string, string | null>;
  return buildInvoicePdf({
    kind: doc.kind as "INVOICE" | "CREDIT_NOTE", number: doc.number!, issuedOn: doc.issuedOn!.toISOString().slice(0, 10), dueOn: doc.dueOn ? doc.dueOn.toISOString().slice(0, 10) : null,
    deliveryText: doc.deliveryText, reference: doc.reference, creditedNumber, buyerName: doc.buyerName, buyerAddress: doc.buyerAddress, buyerVatNumber: doc.buyerVatNumber,
    supplier: { legalName: supplier.legalName ?? null, street: supplier.street ?? null, postalCode: supplier.postalCode ?? null, city: supplier.city ?? null, kvkNumber: supplier.kvkNumber ?? null, vatNumber: supplier.vatNumber ?? null, iban: supplier.iban ?? null },
    lines: doc.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitCents: l.unitCents, vatRateBp: l.vatRateBp })),
  });
}
