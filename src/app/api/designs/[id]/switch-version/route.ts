import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guards";
import { planVersionSwitch, switchDesignVersion } from "@/lib/design/service.server";
import { designErrorResponse } from "@/lib/design/api";

/** Laat zien welke waarden meegaan naar de actieve templateversie. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const plan = await planVersionSwitch(user, id);
    return NextResponse.json({ report: plan.report });
  } catch (error) {
    return designErrorResponse(error);
  }
}

/** Maakt een nieuw concept op de actieve versie; het origineel blijft bestaan. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await switchDesignVersion(user, id);
    return NextResponse.json({ design: { id: result.design.id }, report: result.report });
  } catch (error) {
    return designErrorResponse(error);
  }
}
