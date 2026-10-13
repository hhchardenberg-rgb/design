import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { InvoiceSettingsForm } from "./invoice-settings";

export const metadata: Metadata = { title: "Facturatie-instellingen – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function InvoiceSettingsPage() {
  const a = await pageAccess("settings:read");
  if (!a.allowed) return <NoAccess what="de facturatie-instellingen" />;
  return <InvoiceSettingsForm canEdit={a.permissions.includes("settings:manage_settings")} />;
}
