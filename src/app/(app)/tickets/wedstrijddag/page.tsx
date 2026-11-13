import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { matchdayEvents } from "@/lib/tickets/matchday.server";
import { Matchday } from "./matchday";

export const metadata: Metadata = { title: "Wedstrijddag – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function MatchdayPage() {
  const a = await ticketsPageAccess("scan:history");
  if (!a.allowed) return <NoAccess what="het wedstrijddagscherm van HHC Tickets" />;
  const { events, defaultId } = await matchdayEvents();
  return (
    <Matchday
      events={events.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt.toISOString() }))}
      defaultId={defaultId}
      canCheckIn={a.can("scan:override")}
    />
  );
}
