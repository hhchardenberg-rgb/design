import { handle } from "@/lib/commercial/api";
import { voidPayment } from "@/lib/commercial/invoicing.server";

export const dynamic = "force-dynamic";

/** Maakt een betaling ongeldig (blijft zichtbaar); er wordt niets verwijderd. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => {
    await voidPayment(ctx, id);
  });
}
