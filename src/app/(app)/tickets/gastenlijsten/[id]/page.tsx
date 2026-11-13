import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { ListDetail } from "./list-detail";

export const metadata: Metadata = { title: "Gastenlijst – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function GuestListPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await ticketsPageAccess("tickets:bulk");
  if (!a.allowed) return <NoAccess what="de gastenlijsten van HHC Tickets" />;
  const { id } = await params;
  return <ListDetail id={id} canIssue={a.can("tickets:issue")} canResend={a.can("tickets:resend")} />;
}
