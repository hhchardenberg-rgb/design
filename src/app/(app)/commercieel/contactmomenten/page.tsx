import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { ContactMoments } from "./contact-moments";

export const metadata: Metadata = { title: "Contactmomenten – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function ContactMomentsPage() {
  const a = await pageAccess("history:read");
  if (!a.allowed || !a.permissions.includes("companies:read")) return <NoAccess what="de contactmomenten" />;
  return <ContactMoments canManage={a.permissions.includes("settings:manage_settings")} permissions={a.permissions} />;
}
