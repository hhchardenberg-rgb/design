import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewsAdmin } from "@/components/news-admin";
import { isNewsEnabled, newsRights } from "@/lib/news.server";

export const metadata: Metadata = { title: "Nieuws – Ticketing" };

export default async function AdminTicketingNieuwsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/ticketing/nieuws");
  const [rights, enabled] = await Promise.all([newsRights(session.user, "ticketing"), isNewsEnabled("ticketing")]);
  return <NewsAdmin section="ticketing" enabled={enabled} {...rights} />;
}
