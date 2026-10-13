import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { archiveMailing, getMailing, updateMailing } from "@/lib/commercial/mailings.server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

const schema = z.object({ subject: z.string(), bodyText: z.string(), audienceStatus: z.string().nullable().optional(), version: z.number().int() });

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return handle((ctx) => getMailing(ctx, id));
}

export async function PUT(req: Request, { params }: P) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await updateMailing(ctx, id, schema.parse(body));
  });
}

export async function DELETE(_req: Request, { params }: P) {
  const { id } = await params;
  return handle(async (ctx) => {
    await archiveMailing(ctx, id);
  });
}
