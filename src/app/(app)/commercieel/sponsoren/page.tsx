import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { SponsorList } from "./sponsor-list";

export const metadata: Metadata = { title: "Sponsoren – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function SponsorsPage() {
  const a = await pageAccess("companies:read");
  if (!a.allowed) return <NoAccess what="de sponsoren" />;
  return <SponsorList canCreate={a.permissions.includes("companies:create")} canExportContacts={a.permissions.includes("exports:export") && a.permissions.includes("contacts:read")} />;
}
