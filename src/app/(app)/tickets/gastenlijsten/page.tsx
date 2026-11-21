import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { Lists } from "./lists";

export const metadata: Metadata = { title: "Gastenlijsten – Tickets" };
export const dynamic = "force-dynamic";

export default async function GuestListsPage() {
  const a = await ticketsPageAccess("tickets:bulk");
  if (!a.allowed) return <NoAccess what="de gastenlijsten van Tickets" />;
  return <Lists />;
}
