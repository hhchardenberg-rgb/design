import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guards";
import { designPreview } from "@/lib/design/service.server";
import { designErrorResponse } from "@/lib/design/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Voorbeeldafbeelding van een ontwerp voor overzichten. De pagina zet de
 * revisie in de URL (?r=…), dus het antwoord mag lang in de browser blijven.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const preview = await designPreview(user, id);
    if ("url" in preview) {
      const res = NextResponse.redirect(new URL(preview.url, req.url), 307);
      res.headers.set("Cache-Control", "private, max-age=86400");
      return res;
    }
    return new NextResponse(new Uint8Array(preview.data), {
      headers: { "Content-Type": preview.contentType, "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    return designErrorResponse(error);
  }
}
