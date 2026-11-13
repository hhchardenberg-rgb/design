import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { ticketsPageAccess } from "@/lib/tickets/page.server";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Instellingen – HHC Tickets" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const a = await ticketsPageAccess("settings:manage");
  if (!a.allowed) return <NoAccess what="de instellingen van HHC Tickets" />;
  return <SettingsForm />;
}
