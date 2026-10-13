import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { NoAccess } from "@/components/commercial/no-access";
import { NewsAdmin } from "@/components/news-admin";
import { isNewsEnabled, newsRights } from "@/lib/news.server";

export const metadata: Metadata = { title: "Nieuws beheren – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function CommercialNieuwsBeheerPage() {
  const session = await auth();
  const [rights, enabled] = await Promise.all([newsRights(session!.user, "commercial"), isNewsEnabled("commercial")]);
  if (!rights.canCreate && !rights.canUpdate && !rights.canDelete && !rights.canToggle) return <NoAccess what="het nieuwsbeheer" />;
  return <NewsAdmin section="commercial" enabled={enabled} {...rights} />;
}
