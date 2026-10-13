import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { getContactRules, setContactRules } from "@/lib/commercial/contact-moments.server";

export const dynamic = "force-dynamic";

/** Termijnen voor contactmomenten per sponsorvorm; wijzigen alleen door beheerders. */
export async function GET() {
  return handle((ctx) => getContactRules(ctx));
}

const putSchema = z.object({ rules: z.array(z.object({ tier: z.string(), intervalDays: z.number().int().nullable() })).max(10) });

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await setContactRules(ctx, putSchema.parse(body).rules);
    return { ok: true };
  });
}
