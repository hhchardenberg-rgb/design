import { z } from "zod";
import { handle } from "@/lib/commercial/api";
import { getCompany, updateCompany } from "@/lib/commercial/companies.server";
import { companySchema } from "@/lib/commercial/schemas";

export const dynamic = "force-dynamic";

const updateSchema = companySchema.partial().extend({ version: z.number().int().min(1) });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => getCompany(ctx, id));
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle((ctx) => updateCompany(ctx, id, updateSchema.parse(body)));
}
