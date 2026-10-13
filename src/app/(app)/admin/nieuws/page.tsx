import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewsAdmin } from "@/components/news-admin";
import { isNewsEnabled, newsRights } from "@/lib/news.server";

export const metadata: Metadata = { title: "Nieuws" };

export default async function AdminNieuwsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/nieuws");
  const [rights, enabled] = await Promise.all([newsRights(session.user, "hub"), isNewsEnabled("hub")]);
  return <NewsAdmin section="hub" enabled={enabled} {...rights} />;
}
