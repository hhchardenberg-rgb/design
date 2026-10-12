import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { createActivity, listActivities } from "@/lib/commercial/companies.server";

export const dynamic = "force-dynamic";

const schema = z.object({
  contactId: z.string().nullish(),
  kind: z.enum(["CALL", "VISIT", "MEETING", "EMAIL", "WHATSAPP", "QUOTE", "OTHER"]),
  nature: z.enum(["NOTE", "PROVISIONAL", "FORMAL"]).optional(),
  occurredAt: z.coerce.date(),
  isPlanned: z.boolean().optional(),
  summary: z.string().trim().min(1, "Vul een samenvatting in.").max(5000),
  followUp: z.string().trim().max(1000).nullish(),
  followUpTask: z.object({ title: z.string().trim().min(1).max(200), dueAt: z.coerce.date().nullish() }).nullish(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => ({ activities: await listActivities(ctx, id) }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: (await createActivity(ctx, id, schema.parse(body))).id }));
}
