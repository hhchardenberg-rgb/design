import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildActor, getRightsOverview } from "@/lib/commercial/service.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await requireCommercial("rights:read");
    return NextResponse.json(await getRightsOverview(await buildActor(user)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
