import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { Mailings } from "./mailings";

export const metadata: Metadata = { title: "Mailings – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function MailingsPage() {
  const a = await pageAccess("mailings:read");
  if (!a.allowed) return <NoAccess what="de mailings" />;
  const has = (p: string) => a.permissions.some((x) => x === p);
  return <Mailings canCreate={has("mailings:create")} canUpdate={has("mailings:update")} canSend={has("mailings:send")} />;
}
