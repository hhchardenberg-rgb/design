import { contactOrderSchema, contactSchema } from "@/lib/commercial/schemas";
import { handle } from "@/lib/commercial/api";
import { createContact, listContacts, reorderContacts } from "@/lib/commercial/companies.server";

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

/** Volgorde wijzigen: { order: [id eerste, id tweede, ...] }. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await reorderContacts(ctx, id, contactOrderSchema.parse(body).order);
  });
}
