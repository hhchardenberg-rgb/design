import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { getContactRules, listContactGaps, setContactRules } from "@/lib/commercial/contact-moments.server";

export const dynamic = "force-dynamic";

/** Sponsoren die te lang niet gesproken zijn, plus de ingestelde termijnen. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const tiers = p.get("tiers")?.split(",").filter(Boolean);
  return handle(async (ctx) => ({ ...(await listContactGaps(ctx, { tiers, mine: p.get("mine") === "1" })), ...(await getContactRules(ctx)) }));
}

const putSchema = z.object({ rules: z.array(z.object({ tier: z.string(), intervalDays: z.number().int().nullable() })).max(10) });

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await setContactRules(ctx, putSchema.parse(body).rules);
    return { ok: true };
  });
}
