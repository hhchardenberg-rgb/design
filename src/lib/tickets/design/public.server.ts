import { prisma } from "@/lib/prisma";
import { formatDayTime } from "@/lib/date-format";
import { parseLinkToken } from "../token";
import { loadAssetBytes, ticketInclude, ticketView, type TicketForDesign } from "./context.server";
import { layoutForView, renderPdf } from "./pdf.server";

// Openbare ticketpagina en pdf. Toegang alleen met de bestaande ondertekende link; de mobiele
// pagina en de pdf gebruiken hetzelfde ticket, dezelfde QR-code en hetzelfde vastgelegde ontwerp.
// Openen of downloaden maakt nooit een nieuw toegangsbewijs aan.

export async function ticketByToken(token: string): Promise<TicketForDesign | null> {
  const ref = parseLinkToken(token);
  if (!ref) return null;
  const t = await prisma.ticket.findUnique({ where: { publicId: ref.publicId }, include: ticketInclude });
  if (!t || t.linkVersion !== ref.version || t.anonymizedAt) return null;
  return t;
}

/** Bestandsnaam zonder persoonsgegevens: alleen club, soort en een kort kenmerk. */
export function pdfFileName(t: { publicId: string }, count = 1) {
  return count > 1 ? `hhc-tickets-${count}.pdf` : `hhc-ticket-${t.publicId.slice(0, 4).toLowerCase()}.pdf`;
}

/** Eén of meer tickets als A4-pdf: ieder ticket een eigen pagina en eigen ticketidentiteit. */
export async function ticketsPdf(tickets: TicketForDesign[], locale?: unknown): Promise<Uint8Array> {
  const generatedAt = formatDayTime(new Date());
  const layouts = [];
  for (const t of tickets) {
    const { view } = await ticketView(t, "a4", undefined, locale);
    layouts.push(await layoutForView(view, generatedAt));
  }
  return renderPdf(layouts, loadAssetBytes, { title: tickets.length > 1 ? "Tickets HHC Hardenberg" : "Ticket HHC Hardenberg" });
}
