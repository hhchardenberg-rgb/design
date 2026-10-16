import { NextResponse } from "next/server";
import { requireUser, ApiError } from "@/lib/api-guards";
import { exportDesign } from "@/lib/design/service.server";
import { designErrorResponse } from "@/lib/design/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Definitieve export van een opgeslagen revisie. De client noemt de revisie
 * die hij bedoelt; is die (nog) niet de opgeslagen revisie, dan volgt 409 en
 * wordt er niets gerenderd. Dezelfde invoer levert hetzelfde bestand op.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const revision = Number(body.revision);
    if (!Number.isInteger(revision)) throw new ApiError(400, "Revisie ontbreekt.");
    const result = await exportDesign(user, id, { revision, format: String(body.format ?? "PNG") });
    const e = result.export;
    return NextResponse.json({
      export: {
        id: e.id,
        revision: e.revision,
        format: e.format,
        width: e.width,
        height: e.height,
        bytes: e.bytes,
        url: e.url,
        downloadUrl: `/api/designs/${id}/exports/${e.id}`,
        createdAt: e.createdAt,
      },
      reused: result.reused,
    });
  } catch (error) {
    return designErrorResponse(error);
  }
}
