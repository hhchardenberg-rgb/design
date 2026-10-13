import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { Reports } from "./reports";

export const metadata: Metadata = { title: "Rapportages – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const a = await pageAccess("reports:read");
  if (!a.allowed) return <NoAccess what="de rapportages" />;
  return <Reports canExport={a.permissions.includes("exports:export")} canCompanies={a.permissions.includes("companies:read")} canContracts={a.permissions.includes("contracts:read")} />;
}
