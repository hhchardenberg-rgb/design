import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Afbeeldingsversies voor tickets (logo's, sponsorlogo's, sfeerbeelden). Een versie verandert nooit,
// dus mag hij lang in de cache. Geen persoonsgegevens; alleen bereikbaar met het (niet te raden) versie-id.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return new NextResponse("Niet gevonden.", { status: 404 });
  const v = await prisma.ticketDesignAssetVersion.findUnique({ where: { id }, select: { data: true, mimeType: true } });
  if (!v) return new NextResponse("Niet gevonden.", { status: 404 });
  return new NextResponse(Buffer.from(v.data), {
    headers: { "Content-Type": v.mimeType, "Cache-Control": "public, max-age=31536000, immutable", "X-Robots-Tag": "noindex", "Content-Security-Policy": "default-src 'none'" },
  });
}
