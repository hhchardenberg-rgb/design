import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { ModuleIndex } from "@/components/module-index";
import { visibleTicketingModules, ticketingQuickLinks } from "@/lib/ticketing-modules";
import { auth } from "@/lib/auth";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { loadTicketsAccess } from "@/lib/tickets/authz.server";
import { QuickLinks } from "@/components/quick-links";
import { NewsPosts } from "@/components/news-posts";
import { isNewsEnabled, listNewsPosts } from "@/lib/news.server";

export const metadata: Metadata = { title: "Klantenservice" };

export default async function TicketingPage() {
  const newsEnabled = await isNewsEnabled("ticketing");
  const newsPosts = newsEnabled ? await listNewsPosts("ticketing", 3) : [];
  const session = await auth();
  const access = isTicketsEnabled() && session?.user ? await loadTicketsAccess(session.user.id) : null;
  const modules = visibleTicketingModules({ newsEnabled, supportSearch: !!access?.hasAccess && access.can("support:search") });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Klantenservice"
        title="Klantenservice"
        description="Handleidingen, procedures en belangrijke informatie over het ticketingsysteem, en alles om supporters snel te helpen."
      />

      <QuickLinks links={ticketingQuickLinks} />

      {newsPosts.length > 0 && (
        <section>
          <SectionHeader title="Nieuws" action={<Link href="/klantenservice/nieuws" className="font-semibold text-hhc-orange-dark hover:underline">Alle berichten</Link>} />
          <NewsPosts variant="dashboard" posts={newsPosts} />
        </section>
      )}

      <section>
        <SectionHeader title="Onderdelen" />
        <ModuleIndex items={modules.map((m) => ({ key: m.id, title: m.title, description: m.description, href: m.href, icon: m.icon, status: m.status }))} />
      </section>
    </div>
  );
}
