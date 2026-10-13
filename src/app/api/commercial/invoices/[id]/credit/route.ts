import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { createCreditNote } from "@/lib/commercial/invoicing.server";

export const dynamic = "force-dynamic";

const line = z.object({ description: z.string(), quantity: z.number().int().optional(), unitCents: z.number().int(), vatRateBp: z.number().int().nullable().optional() });
const schema = z.object({ reference: z.string().nullable().optional(), lines: z.array(line).optional() });

/** Maakt een concept-creditnota bij een definitieve factuur; zonder regels worden alle regels overgenomen. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handle(async (ctx) => ({ id: await createCreditNote(ctx, id, schema.parse(body)) }));
}
