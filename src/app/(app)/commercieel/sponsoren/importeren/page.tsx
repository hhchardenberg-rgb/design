import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importeren – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const a = await pageAccess("companies:create");
  if (!a.allowed) return <NoAccess what="het importeren van sponsoren" />;
  return <ImportWizard />;
}
