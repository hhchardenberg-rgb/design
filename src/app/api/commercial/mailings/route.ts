import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { createMailing, listMailings } from "@/lib/commercial/mailings.server";

export const dynamic = "force-dynamic";

const mailingSchema = z.object({ subject: z.string(), bodyText: z.string(), audienceStatus: z.string().nullable().optional(), audienceTiers: z.array(z.string()).max(10).optional() });

export async function GET() {
  return handle(async (ctx) => ({ mailings: await listMailings(ctx) }));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: await createMailing(ctx, mailingSchema.parse(body)) }));
}
