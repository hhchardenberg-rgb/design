import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { createInvoice, listInvoices } from "@/lib/commercial/invoicing.server";

export const dynamic = "force-dynamic";

const line = z.object({ description: z.string(), quantity: z.number().int().optional(), unitCents: z.number().int(), vatRateBp: z.number().int().nullable().optional() });
const schema = z.object({
  companyId: z.string().min(1, "Kies een sponsor."),
  contractId: z.string().nullable().optional(), buyerName: z.string().nullable().optional(), buyerAddress: z.string().nullable().optional(),
  buyerVatNumber: z.string().nullable().optional(), reference: z.string().nullable().optional(), deliveryText: z.string().nullable().optional(),
  lines: z.array(line).optional(),
});

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle(async (ctx) => ({ invoices: await listInvoices(ctx, { companyId: p.get("companyId") ?? undefined, kind: p.get("kind") ?? undefined, status: p.get("status") ?? undefined }) }));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    const { companyId, ...rest } = schema.parse(body);
    return { id: await createInvoice(ctx, companyId, rest) };
  });
}
