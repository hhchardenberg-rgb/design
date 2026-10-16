import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guards";
import { duplicateDesign } from "@/lib/design/service.server";
import { designErrorResponse } from "@/lib/design/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const design = await duplicateDesign(user, id);
    return NextResponse.json({ design: { id: design.id } });
  } catch (error) {
    return designErrorResponse(error);
  }
}
