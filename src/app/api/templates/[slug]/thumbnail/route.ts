import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guards";
import { ensureTemplateThumbnail } from "@/lib/design/template-versions.server";
import { designErrorResponse } from "@/lib/design/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Miniatuur van een gepubliceerde template. De pagina zet versie en
 * voorbeeldstijl in de URL (?v=…), dus het antwoord mag in de browser blijven.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireUser();
    const { slug } = await params;
    const url = await ensureTemplateThumbnail(decodeURIComponent(slug));
    if (!url) return new NextResponse(null, { status: 404 });
    const res = NextResponse.redirect(new URL(url, req.url), 307);
    res.headers.set("Cache-Control", "private, max-age=86400");
    return res;
  } catch (error) {
    return designErrorResponse(error);
  }
}
