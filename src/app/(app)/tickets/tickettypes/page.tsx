import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { TypesManager } from "./types-manager";

export const metadata: Metadata = { title: "Tickettypes, vakken en seizoenen – Tickets" };
export const dynamic = "force-dynamic";

export default async function TypesPage() {
  const a = await ticketsPageAccess("types:read");
  if (!a.allowed) return <NoAccess what="de tickettypes van Tickets" />;
  return <TypesManager canManage={a.can("types:manage")} />;
}
