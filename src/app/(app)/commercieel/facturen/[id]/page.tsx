import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { InvoiceDetail } from "./invoice-detail";

export const metadata: Metadata = { title: "Factuur – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await pageAccess("invoices:read");
  if (!a.allowed) return <NoAccess what="de facturen" />;
  return <InvoiceDetail id={id} permissions={a.permissions} />;
}
