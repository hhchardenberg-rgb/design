import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { ScannersManager } from "./scanners-manager";

export const metadata: Metadata = { title: "Scannerbeheer – Tickets" };
export const dynamic = "force-dynamic";

export default async function ScannersPage() {
  const a = await ticketsPageAccess("scanners:manage");
  if (!a.allowed) return <NoAccess what="het scannerbeheer van Tickets" />;
  return <ScannersManager />;
}
