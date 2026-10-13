import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { Goals } from "./goals";

export const metadata: Metadata = { title: "Doelen en prognose – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const a = await pageAccess("reports:read");
  if (!a.allowed || !a.permissions.includes("contracts:read")) return <NoAccess what="doelen en prognose" />;
  return <Goals canEdit={a.permissions.includes("settings:manage_settings") && a.permissions.includes("amounts:read")} />;
}
