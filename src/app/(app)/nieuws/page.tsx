import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewsFeedPage } from "@/components/news-feed-page";
import { isNewsEnabled, listNewsPosts, loadNewsRights } from "@/lib/news.server";

export const metadata: Metadata = { title: "Nieuws" };

export default async function NieuwsPage() {
  const session = await auth();
  if (!session?.user) notFound();
  const [rights, enabled] = await Promise.all([loadNewsRights(session.user).then((r) => r.hub), isNewsEnabled("hub")]);
  if (!enabled && !rights.canToggle) notFound();
  const posts = await listNewsPosts("hub");
  return (
    <NewsFeedPage
      section="hub"
      posts={posts}
      enabled={enabled}
      manageHref={rights.canCreate || rights.canUpdate || rights.canDelete || rights.canToggle ? "/admin/nieuws" : null}
    />
  );
}
