import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { ReminderSettingsForm } from "./reminder-settings";

export const metadata: Metadata = { title: "Herinneringsmail – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function ReminderSettingsPage() {
  const a = await pageAccess("settings:read");
  if (!a.allowed) return <NoAccess what="de instellingen van de herinneringsmail" />;
  return <ReminderSettingsForm canEdit={a.permissions.includes("settings:manage_settings")} />;
}
