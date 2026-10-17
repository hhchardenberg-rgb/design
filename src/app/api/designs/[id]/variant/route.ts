import { NextResponse } from "next/server";
import { requireUser, ApiError } from "@/lib/api-guards";
import { createFormatVariant } from "@/lib/design/service.server";
import { designErrorResponse } from "@/lib/design/api";

/** Maakt hetzelfde ontwerp in een ander formaat van de templatefamilie. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (typeof body.templateId !== "string") throw new ApiError(400, "Kies een formaat.");
    const { design, slug } = await createFormatVariant(user, id, body.templateId);
    return NextResponse.json({ design: { id: design.id }, slug });
  } catch (error) {
    return designErrorResponse(error);
  }
}
