import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { TeamManager } from "./team-manager";

export const metadata: Metadata = { title: "Teams – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const a = await pageAccess("settings:read");
  if (!a.allowed) return <NoAccess what="de teamindeling" />;
  return <TeamManager canManage={a.permissions.includes("settings:manage_settings") && a.permissions.includes("rights:manage_rights")} canCreate={a.permissions.includes("settings:manage_settings")} />;
}
