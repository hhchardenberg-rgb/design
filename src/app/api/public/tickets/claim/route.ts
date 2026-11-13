import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError, apiErrorResponse } from "@/lib/api-guards";
import { clientIpFrom } from "@/lib/login-rate-limit";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { claimPromo, publicPromoInfo } from "@/lib/tickets/promo.server";

export const dynamic = "force-dynamic";

/** Openbaar: informatie over een actiecode (?code=...). */
export async function GET(req: Request) {
  try {
    if (!isTicketsEnabled()) throw new ApiError(404, "Niet gevonden.");
    return NextResponse.json(await publicPromoInfo(new URL(req.url).searchParams.get("code") ?? ""));
  } catch (e) {
    return apiErrorResponse(e);
  }
}

/** Openbaar: een actiecode inwisselen. */
export async function POST(req: Request) {
  try {
    if (!isTicketsEnabled()) throw new ApiError(404, "Niet gevonden.");
    return NextResponse.json(await claimPromo(await req.json().catch(() => ({})), clientIpFrom(req)));
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message || "Controleer de ingevulde gegevens." }, { status: 400 });
    return apiErrorResponse(e);
  }
}
