import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { discardDraft, getInvoice, updateInvoice } from "@/lib/commercial/invoicing.server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

const line = z.object({ description: z.string(), quantity: z.number().int().optional(), unitCents: z.number().int(), vatRateBp: z.number().int().nullable().optional() });
const schema = z.object({
  version: z.number().int(),
  buyerName: z.string().nullable().optional(), buyerAddress: z.string().nullable().optional(), buyerVatNumber: z.string().nullable().optional(),
  reference: z.string().nullable().optional(), deliveryText: z.string().nullable().optional(), lines: z.array(line).optional(),
});

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return handle((ctx) => getInvoice(ctx, id));
}

export async function PUT(req: Request, { params }: P) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await updateInvoice(ctx, id, schema.parse(body));
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(async (ctx) => {
    await discardDraft(ctx, id);
  });
}
