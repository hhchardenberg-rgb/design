import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { EventsManager } from "./events-manager";

export const metadata: Metadata = { title: "Wedstrijden – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const a = await ticketsPageAccess("events:read");
  if (!a.allowed) return <NoAccess what="de wedstrijden van HHC Tickets" />;
  return <EventsManager canManage={a.can("events:manage")} canMail={a.can("tickets:resend")} />;
}
