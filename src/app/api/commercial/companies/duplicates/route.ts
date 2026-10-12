import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { findDuplicates } from "@/lib/commercial/companies.server";

const schema = z.object({ name: z.string().trim().min(1), kvkNumber: z.string().trim().nullish(), excludeId: z.string().optional() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle((ctx) => findDuplicates(ctx, schema.parse(body)));
}
