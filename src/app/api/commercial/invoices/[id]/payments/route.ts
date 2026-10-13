import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { addPayment } from "@/lib/commercial/invoicing.server";

export const dynamic = "force-dynamic";

const schema = z.object({ amountCents: z.number().int(), paidOn: z.string(), note: z.string().nullable().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await addPayment(ctx, id, schema.parse(body)) }));
}
