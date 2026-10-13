import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewsFeedPage } from "@/components/news-feed-page";
import { isNewsEnabled, listNewsPosts, newsRights } from "@/lib/news.server";

export const metadata: Metadata = { title: "Nieuws – Ticketing" };

export default async function TicketingNieuwsPage() {
  const session = await auth();
  if (!session?.user) notFound();
  const [rights, enabled] = await Promise.all([newsRights(session.user, "ticketing"), isNewsEnabled("ticketing")]);
  if (!enabled && !rights.canToggle) notFound();
  const posts = await listNewsPosts("ticketing");
  return <NewsFeedPage section="ticketing" posts={posts} enabled={enabled} manageHref={rights.canCreate ? "/admin/ticketing/nieuws" : null} />;
}
