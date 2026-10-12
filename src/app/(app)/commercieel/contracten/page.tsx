import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { ContractOverview } from "./contract-overview";

export const metadata: Metadata = { title: "Contracten – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const a = await pageAccess("contracts:read");
  if (!a.allowed) return <NoAccess what="de contracten" />;
  return <ContractOverview />;
}
