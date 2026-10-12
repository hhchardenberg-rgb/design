import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { SeasonPackageManager } from "./season-package-manager";

export const metadata: Metadata = { title: "Seizoenen en pakketten – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function SeasonsPage() {
  const a = await pageAccess("contracts:read");
  if (!a.allowed) return <NoAccess what="de seizoenen en pakketten" />;
  return <SeasonPackageManager canManage={a.permissions.includes("settings:manage_settings")} canAmounts={a.permissions.includes("amounts:update")} />;
}
