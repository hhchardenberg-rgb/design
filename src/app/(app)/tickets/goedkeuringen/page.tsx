import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { Approvals } from "./approvals";

export const metadata: Metadata = { title: "Goedkeuringen – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const a = await ticketsPageAccess("bulk:approve");
  if (!a.allowed) return <NoAccess what="goedkeuringen" />;
  return <Approvals userId={a.userId} />;
}
