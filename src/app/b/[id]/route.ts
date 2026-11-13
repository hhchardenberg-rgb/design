import { NextResponse } from "next/server";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { registerBannerClick } from "@/lib/tickets/banner.server";

export const dynamic = "force-dynamic";

/** Klik op een sponsorbanner in een ticketmail: tellen en doorsturen naar de opgeslagen link. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isTicketsEnabled()) return new NextResponse("Niet gevonden.", { status: 404 });
  const { id } = await params;
  const url = await registerBannerClick(id, new URL(req.url).searchParams.get("t")).catch(() => null);
  if (!url) return new NextResponse("Niet gevonden.", { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
