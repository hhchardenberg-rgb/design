import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError, apiErrorResponse } from "@/lib/api-guards";
import { clientIpFrom } from "@/lib/login-rate-limit";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { requestTicketResend } from "@/lib/tickets/resend.server";

export const dynamic = "force-dynamic";

/** Openbaar: een ticket opnieuw laten sturen naar het e-mailadres dat erbij staat. */
export async function POST(req: Request) {
  try {
    if (!isTicketsEnabled()) throw new ApiError(404, "Niet gevonden.");
    return NextResponse.json(await requestTicketResend(await req.json().catch(() => ({})), clientIpFrom(req)));
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message || "Vul een geldig e-mailadres in." }, { status: 400 });
    return apiErrorResponse(e);
  }
}
