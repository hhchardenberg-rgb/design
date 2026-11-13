import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { FullhousePanel } from "./fullhouse-panel";

export const metadata: Metadata = { title: "Fullhouse – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function FullhousePage() {
  const a = await ticketsPageAccess("sync:read");
  if (!a.allowed) return <NoAccess what="de Fullhouse-koppeling van HHC Tickets" />;
  return <FullhousePanel canManage={a.can("sync:manage")} />;
}
