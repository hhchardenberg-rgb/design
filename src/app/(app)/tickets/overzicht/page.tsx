import type { Metadata } from "next";
import { Suspense } from "react";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { ResendCard } from "./resend-card";
import { TicketList } from "./ticket-list";

export const metadata: Metadata = { title: "Ticketoverzicht – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const a = await ticketsPageAccess("tickets:read");
  if (!a.allowed) return <NoAccess what="het ticketoverzicht" />;
  return (
    <div className="space-y-5">
      {a.can("tickets:resend") && <ResendCard />}
      <Suspense>
        <TicketList />
      </Suspense>
    </div>
  );
}
