import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { getInvoiceSettings, saveInvoiceSettings } from "@/lib/commercial/invoicing.server";

export const dynamic = "force-dynamic";

const s = z.string().nullable();
const n = z.number().int().nullable();
const schema = z.object({
  legalName: s, street: s, postalCode: s, city: s, kvkNumber: s, vatNumber: s, iban: s, paymentTermDays: n,
  invoicePrefix: s, nextInvoiceNumber: n, creditPrefix: s, nextCreditNumber: n, version: z.number().int(),
});

export async function GET() {
  return handle((ctx) => getInvoiceSettings(ctx));
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await saveInvoiceSettings(ctx, schema.parse(body));
  });
}
