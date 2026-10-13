import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { InvoiceList } from "./invoice-list";

export const metadata: Metadata = { title: "Facturen – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const a = await pageAccess("invoices:read");
  if (!a.allowed) return <NoAccess what="de facturen" />;
  return <InvoiceList canCreate={a.permissions.includes("invoices:create")} />;
}
