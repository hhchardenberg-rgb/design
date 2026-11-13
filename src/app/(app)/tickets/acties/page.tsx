import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { Promos } from "./promos";

export const metadata: Metadata = { title: "Actiecodes – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function PromosPage() {
  const a = await ticketsPageAccess("tickets:bulk");
  if (!a.allowed) return <NoAccess what="de actiecodes van HHC Tickets" />;
  return <Promos />;
}
