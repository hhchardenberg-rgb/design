import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { NotificationSettings } from "./notification-settings";

export const metadata: Metadata = { title: "Meldingen – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const a = await pageAccess("settings:read");
  if (!a.allowed) return <NoAccess what="de instellingen voor meldingen" />;
  return <NotificationSettings canEdit={a.permissions.includes("settings:manage_settings")} />;
}
