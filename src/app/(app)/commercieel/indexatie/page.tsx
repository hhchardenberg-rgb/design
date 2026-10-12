import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { IndexationTool } from "./indexation-tool";

export const metadata: Metadata = { title: "Indexatie – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function IndexationPage() {
  const a = await pageAccess("amounts:read");
  if (!a.allowed) return <NoAccess what="de indexatie" />;
  return <IndexationTool canApply={a.permissions.includes("amounts:approve") && a.permissions.includes("amounts:update")} />;
}
