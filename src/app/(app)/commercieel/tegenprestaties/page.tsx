import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { CounterpartPlan } from "./counterpart-plan";

export const metadata: Metadata = { title: "Tegenprestaties – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function CounterpartsPage() {
  const a = await pageAccess("counterparts:read");
  if (!a.allowed || !a.permissions.includes("contracts:read")) return <NoAccess what="de tegenprestaties" />;
  return <CounterpartPlan canUpdate={a.permissions.includes("counterparts:update")} />;
}
