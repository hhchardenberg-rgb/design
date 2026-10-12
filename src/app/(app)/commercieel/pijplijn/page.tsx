import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { PipelineBoard } from "./pipeline-board";

export const metadata: Metadata = { title: "Pijplijn – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const a = await pageAccess("opportunities:read");
  if (!a.allowed) return <NoAccess what="de pijplijn" />;
  const has = (p: string) => a.permissions.some((x) => x === p);
  return <PipelineBoard canCreate={has("opportunities:create")} canUpdate={has("opportunities:update")} canArchive={has("opportunities:archive")} canContract={has("contracts:create")} canAmount={has("amounts:update")} />;
}
