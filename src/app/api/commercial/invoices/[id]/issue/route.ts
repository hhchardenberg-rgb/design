import { handle } from "@/lib/commercial/api";
import { issueDocument } from "@/lib/commercial/invoicing.server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle((ctx) => issueDocument(ctx, id));
}
