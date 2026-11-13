import { notFound } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { CommercialSidebar } from "@/components/commercial/commercial-sidebar";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { loadTicketsAccess } from "@/lib/tickets/authz.server";
import { visibleTicketsNav } from "@/lib/tickets/navigation";

export const dynamic = "force-dynamic";

// Toegangspoort voor heel HHC Tickets. Flag uit: de sectie bestaat niet (404).
// Zonder rol met HHC Tickets-toegang: duidelijke weigering.
export default async function TicketsLayout({ children }: { children: React.ReactNode }) {
  if (!isTicketsEnabled()) notFound();
  const session = await auth();
  if (!session?.user) notFound();
  const access = await loadTicketsAccess(session.user.id);
  if (!access.hasAccess) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
              <ShieldOff className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">Geen toegang tot HHC Tickets</h1>
            <p className="text-sm text-muted-foreground">Je account heeft geen rol met toegang tot HHC Tickets. Vraag de hoofdadmin om toegang als je die nodig hebt.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  const groups = visibleTicketsNav(access.can).map((g) => ({ id: g.id, label: g.label, items: g.items.map((i) => ({ href: i.href, label: i.label })) }));
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      <CommercialSidebar groups={groups} homeHref="/tickets" label="HHC Tickets" homeLabel="Dashboard" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
