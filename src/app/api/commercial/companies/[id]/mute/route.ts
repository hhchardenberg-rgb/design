import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { setCompanyMuted } from "@/lib/commercial/reminder-settings.server";

export const dynamic = "force-dynamic";

const schema = z.object({ muted: z.boolean() });

/** Sponsor voor jezelf op stil zetten of weer aan. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await setCompanyMuted(ctx, id, schema.parse(body).muted);
  });
}
