import { handle } from "@/lib/commercial/api";
import { archiveContact, updateContact } from "@/lib/commercial/companies.server";
import { contactSchema } from "@/lib/commercial/schemas";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return handle(async (ctx) => {
    await updateContact(ctx, id, contactSchema.partial().parse(body));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => archiveContact(ctx, id));
}
