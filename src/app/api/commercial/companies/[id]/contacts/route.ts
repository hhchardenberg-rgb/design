import { contactSchema } from "@/lib/commercial/schemas";
import { handle } from "@/lib/commercial/api";
import { createContact, listContacts } from "@/lib/commercial/companies.server";

export const dynamic = "force-dynamic";


export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => ({ contacts: await listContacts(ctx, id) }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => ({ id: (await createContact(ctx, id, contactSchema.parse(body))).id }));
}
