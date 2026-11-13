import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-guards";
import { clientIpFrom } from "@/lib/login-rate-limit";
import { scannerLogin } from "@/lib/tickets/scanner-auth.server";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().min(3).max(12), pin: z.string().regex(/^\d{4,8}$/, "De PIN bestaat uit cijfers.") });

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    return NextResponse.json(await scannerLogin(body.code, body.pin, clientIpFrom(req)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Controleer de invoer." }, { status: 400 });
    return apiErrorResponse(error);
  }
}
