import { notFound, redirect } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { MFA_SETUP_PATH } from "@/lib/auth-policy";
import { Card, CardContent } from "@/components/ui/card";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { loadTicketsAccess } from "@/lib/tickets/authz.server";
import { pwaMetadata } from "@/lib/pwa-apps";

export const dynamic = "force-dynamic";
// Eigen app op het beginscherm (manifest, icoon, naam): zie src/lib/pwa-apps.ts.
export const metadata = pwaMetadata("tickets");

// Toegangspoort voor heel HHC Tickets. Flag uit: de sectie bestaat niet (404).
// Zonder rol met HHC Tickets-toegang: duidelijke weigering.
export default async function TicketsLayout({ children }: { children: React.ReactNode }) {
  if (!isTicketsEnabled()) notFound();
  const session = await auth();
  if (!session?.user) notFound();
  // De routebewaking leest de tweestapsplicht uit het sessiecookie; dat kan nog van vóór de plicht zijn
  // (rol net uitgebreid, of HHC Tickets net aangezet). auth() leest hem hier vers uit de database.
  if (session.user.mfaSetupRequired) redirect(`${MFA_SETUP_PATH}?verplicht=1`);
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
  // Het menu van HHC Tickets staat in de zijbalk van de Hub (zie app-shell.tsx).
  return <>{children}</>;
}
