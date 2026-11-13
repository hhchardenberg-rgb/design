import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { BulkIssue } from "./bulk-issue";

export const metadata: Metadata = { title: "Bulkuitgifte – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function BulkPage() {
  const a = await ticketsPageAccess("tickets:bulk");
  if (!a.allowed) return <NoAccess what="bulkuitgifte" />;
  return <BulkIssue />;
}
