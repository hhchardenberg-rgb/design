import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { EventAttendance } from "./event-attendance";

export const metadata: Metadata = { title: "Aanwezigheid per duel – Tickets" };
export const dynamic = "force-dynamic";

export default async function EventAttendancePage({ params }: { params: Promise<{ eventId: string }> }) {
  const a = await ticketsPageAccess("tickets:read");
  if (!a.allowed) return <NoAccess what="de seizoenspassen van Tickets" />;
  const { eventId } = await params;
  return <EventAttendance eventId={eventId} canEditEvent={a.can("events:manage")} />;
}
