import { NextResponse } from "next/server";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { pdfFileName, ticketByToken, ticketsPdf } from "@/lib/tickets/design/public.server";
import { displayStatus, type TicketStatus } from "@/lib/tickets/rules";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// A4-ticket als pdf. Opnieuw downloaden geeft exact hetzelfde ticket (zelfde QR, zelfde rechten).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isTicketsEnabled()) return new NextResponse("Niet gevonden.", { status: 404 });
  const { token } = await params;
  const t = await ticketByToken(decodeURIComponent(token));
  if (!t || displayStatus({ status: t.status as TicketStatus, validUntil: t.validUntil }, new Date()) !== "ACTIVE") return new NextResponse("Niet gevonden.", { status: 404 });
  const bytes = await ticketsPdf([t]);
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${pdfFileName(t)}"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" },
  });
}
