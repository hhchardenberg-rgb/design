import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireScanActor, type ScanActor } from "./scanner-auth.server";

/** Omhulsel voor de scanner-API's: scanner-token of Hub-sessie, nooit gecachet. */
export async function handleScan(req: Request, fn: (actor: ScanActor) => Promise<unknown>) {
  try {
    const actor = await requireScanActor(req);
    return NextResponse.json(await fn(actor), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Ongeldige scan." }, { status: 400 });
    return apiErrorResponse(error);
  }
}
