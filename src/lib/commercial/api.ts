import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "./authz.server";
import { buildRecordCtx, type RecordCtx } from "./ctx.server";

/**
 * Standaard omhulsel voor commerciële API-routes: flag, sessie, lidmaatschap en
 * recordcontext worden hier centraal gecontroleerd; de service dwingt daarna
 * bevoegdheid en bereik per handeling af. Fouten worden uniform vertaald.
 */
export async function handle(fn: (ctx: RecordCtx) => Promise<unknown>) {
  try {
    const { user } = await requireCommercial();
    const result = await fn(await buildRecordCtx(user));
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const num = (v: string | null, fallback?: number) => (v && /^\d+$/.test(v) ? Number(v) : fallback);
