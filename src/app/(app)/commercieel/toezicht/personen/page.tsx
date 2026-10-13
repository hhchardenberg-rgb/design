import type { Metadata } from "next";
import { NoAccess } from "@/components/commercial/no-access";
import { pageAccess } from "@/lib/commercial/page.server";
import { PeopleOverview } from "./people-overview";

export const metadata: Metadata = { title: "Per persoon – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const a = await pageAccess("rights:manage_rights");
  if (!a.allowed) return <NoAccess what="het overzicht per persoon" />;
  return <PeopleOverview />;
}
