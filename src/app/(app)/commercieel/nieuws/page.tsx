import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewsFeedPage } from "@/components/news-feed-page";
import { isNewsEnabled, listNewsPosts, loadNewsRights } from "@/lib/news.server";

export const metadata: Metadata = { title: "Nieuws – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function CommercialNieuwsPage() {
  const session = await auth();
  const [rights, enabled] = await Promise.all([loadNewsRights(session!.user).then((r) => r.commercial), isNewsEnabled("commercial")]);
  if (!enabled && !rights.canToggle) notFound();
  const posts = await listNewsPosts("commercial");
  return (
    <NewsFeedPage
      section="commercial"
      posts={posts}
      enabled={enabled}
      manageHref={rights.canCreate || rights.canUpdate || rights.canDelete || rights.canToggle ? "/admin/nieuws" : null}
    />
  );
}
