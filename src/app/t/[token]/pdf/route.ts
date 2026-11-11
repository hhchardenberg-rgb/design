import { NextResponse } from "next/server";
import { publicTicketByToken, ticketPdf } from "@/lib/tickets/delivery.server";
import { isTicketsEnabled } from "@/lib/tickets/flag";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isTicketsEnabled()) return new NextResponse("Niet gevonden.", { status: 404 });
  const { token } = await params;
  const t = await publicTicketByToken(decodeURIComponent(token));
  if (!t || !t.usable) return new NextResponse("Niet gevonden.", { status: 404 });
  const bytes = await ticketPdf(t);
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="hhc-ticket.pdf"', "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
