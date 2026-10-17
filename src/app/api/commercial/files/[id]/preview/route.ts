import { NextResponse } from "next/server";
import { ApiError, apiErrorResponse } from "@/lib/api-guards";
import { handle } from "@/lib/commercial/api";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildRecordCtx } from "@/lib/commercial/ctx.server";
import { MAX_FILE_BYTES, readPreview, setManualPreview } from "@/lib/commercial/files.server";

export const dynamic = "force-dynamic";

/** Voorbeeldafbeelding van een bestand (bv. een EPS-logo als PNG). Zelfde controles als downloaden, zonder logboekregel. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireCommercial();
    const p = await readPreview(await buildRecordCtx(user), id);
    return new NextResponse(new Uint8Array(p.data), {
      headers: {
        "Content-Type": p.mime,
        "Content-Length": String(p.data.length),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Los een voorbeeld toevoegen, voor een bestand waar er zelf geen uit te halen was. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async (ctx) => {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_FILE_BYTES + 64 * 1024) throw new ApiError(413, "Het bestand is groter dan 4 MB.");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) throw new ApiError(400, "Kies een afbeelding.");
    return { file: await setManualPreview(ctx, id, { name: file.name, data: Buffer.from(await file.arrayBuffer()) }) };
  });
}
