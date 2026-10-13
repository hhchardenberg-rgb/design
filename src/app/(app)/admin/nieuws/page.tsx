import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveHomePath } from "@/lib/roles";
import { NewsAdmin } from "@/components/news-admin";
import { canManageAnyNews, loadNewsEnabled, loadNewsRights } from "@/lib/news.server";

export const metadata: Metadata = { title: "Nieuws" };

// De centrale nieuwsmodule: open voor iedere beheerder die bij minstens één onderdeel
// nieuws mag beheren (de proxy laat /admin/nieuws daarom voor alle ingelogden door).
export default async function AdminNieuwsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/nieuws");
  const [rights, enabled] = await Promise.all([loadNewsRights(session.user), loadNewsEnabled()]);
  if (!canManageAnyNews(rights)) redirect(resolveHomePath(session.user.roles ?? []));
  return <NewsAdmin rights={rights} enabled={enabled} />;
}
