import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { AuditLog } from "./audit-log";

export const metadata: Metadata = { title: "Logboek – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const a = await pageAccess("rights:manage_rights");
  if (!a.allowed) return <NoAccess what="het logboek" />;
  return <AuditLog />;
}
