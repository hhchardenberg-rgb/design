import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { DeletedCompanyDetail } from "./deleted-company";

export const metadata: Metadata = { title: "Verwijderd dossier – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function DeletedCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await pageAccess("deleted_archive:read");
  if (!a.allowed) return <NoAccess what="het gesloten archief" />;
  return <DeletedCompanyDetail id={id} />;
}
