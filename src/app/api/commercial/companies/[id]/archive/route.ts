import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { setCompanyArchived } from "@/lib/commercial/companies.server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle((ctx) => setCompanyArchived(ctx, id, z.object({ archived: z.boolean() }).parse(body).archived));
}
