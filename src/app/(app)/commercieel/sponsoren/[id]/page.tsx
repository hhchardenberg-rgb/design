import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { CompanyDetail } from "./company-detail";

export const metadata: Metadata = { title: "Sponsordossier – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await pageAccess("companies:read");
  if (!a.allowed) return <NoAccess what="de sponsoren" />;
  return <CompanyDetail id={id} permissions={a.permissions} />;
}
