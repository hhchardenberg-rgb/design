import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { PassDetail } from "./pass-detail";

export const metadata: Metadata = { title: "Seizoenspas – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function PassPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await ticketsPageAccess("tickets:read");
  if (!a.allowed) return <NoAccess what="de seizoenspassen van HHC Tickets" />;
  const { id } = await params;
  return <PassDetail id={id} canTransfer={a.can("tickets:issue") && a.can("tickets:resend")} canPersonal={a.can("tickets:personal")} />;
}
