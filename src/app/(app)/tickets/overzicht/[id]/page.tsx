import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { TicketDetail } from "./ticket-detail";

export const metadata: Metadata = { title: "Ticket – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await ticketsPageAccess("tickets:read");
  if (!a.allowed) return <NoAccess what="tickets" />;
  const { id } = await params;
  return <TicketDetail id={id} canBlock={a.can("tickets:block")} canResend={a.can("tickets:resend")} canAnonymize={a.can("tickets:anonymize")} />;
}
