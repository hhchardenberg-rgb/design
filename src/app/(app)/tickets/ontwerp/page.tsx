import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { DesignEditor } from "@/components/tickets/design/editor";

export const metadata: Metadata = { title: "Ticketontwerp en standaarden – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function DesignPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const a = await ticketsPageAccess("design:read");
  if (!a.allowed) return <NoAccess what="het ticketontwerp" />;
  const { scope } = await searchParams;
  return <DesignEditor initialScope={scope && scope.length < 200 ? scope : "club"} />;
}
