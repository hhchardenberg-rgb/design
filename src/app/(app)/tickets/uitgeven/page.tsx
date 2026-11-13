import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { IssueForm } from "./issue-form";

export const metadata: Metadata = { title: "Tickets uitgeven – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function IssuePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const a = await ticketsPageAccess("tickets:issue");
  if (!a.allowed) return <NoAccess what="het uitgeven van tickets" />;
  const sp = await searchParams;
  return <IssueForm canMultiple={a.can("tickets:bulk")} initialTypeId={sp.type} />;
}
