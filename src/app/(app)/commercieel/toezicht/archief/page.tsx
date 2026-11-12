import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { DeletedArchive } from "./deleted-archive";

export const metadata: Metadata = { title: "Gesloten archief – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function DeletedArchivePage() {
  const a = await pageAccess("deleted_archive:read");
  if (!a.allowed) return <NoAccess what="het gesloten archief" />;
  return <DeletedArchive />;
}
