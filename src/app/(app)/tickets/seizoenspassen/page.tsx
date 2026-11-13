import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { Passes } from "./passes";

export const metadata: Metadata = { title: "Seizoenspassen – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function PassesPage() {
  const a = await ticketsPageAccess("tickets:read");
  if (!a.allowed) return <NoAccess what="de seizoenspassen van HHC Tickets" />;
  return <Passes canRenew={a.can("tickets:issue")} />;
}
