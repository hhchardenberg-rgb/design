import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-guards";
import { requireCommercial } from "@/lib/commercial/authz.server";
import { buildRecordCtx } from "@/lib/commercial/ctx.server";
import { readFileForDownload } from "@/lib/commercial/files.server";

export const dynamic = "force-dynamic";

/** Beveiligde download: sessie, lidmaatschap, bevoegdheid en dossierbereik worden bij elk verzoek gecontroleerd. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireCommercial();
    const ctx = await buildRecordCtx(user);
    const f = await readFileForDownload(ctx, id, new URL(req.url).searchParams.get("inline") === "1");
    const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new NextResponse(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.mime,
        "Content-Length": String(f.data.length),
        "Content-Disposition": `${f.inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
