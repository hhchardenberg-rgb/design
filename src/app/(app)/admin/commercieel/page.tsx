import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { AccessAdmin } from "./access-admin";

export const metadata: Metadata = { title: "Toegang Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default function AdminCommercialPage() {
  if (!isCommercialEnabled()) notFound();
  return <AccessAdmin />;
}
