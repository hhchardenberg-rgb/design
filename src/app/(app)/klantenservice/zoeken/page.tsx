import type { Metadata } from "next";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NoAccess } from "@/components/commercial/no-access";
import { auth } from "@/lib/auth";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { loadTicketsAccess } from "@/lib/tickets/authz.server";
import { fullhouseMode } from "@/lib/tickets/fullhouse";
import { SupportSearch } from "./support-search";

export const metadata: Metadata = { title: "Klant of ticket zoeken – Klantenservice" };
export const dynamic = "force-dynamic";

export default async function SupportSearchPage() {
  if (!isTicketsEnabled()) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm">
          <Info className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span>De zoektool werkt zodra Tickets aan staat.</span>
        </CardContent>
      </Card>
    );
  }
  const session = await auth();
  const access = await loadTicketsAccess(session!.user.id);
  if (!access.hasAccess || !access.can("support:search")) return <NoAccess what="de zoektool van Klantenservice" />;
  return <SupportSearch canResend={access.can("tickets:resend")} canView={access.can("tickets:read")} personal={access.can("tickets:personal")} testMode={fullhouseMode() === "mock"} />;
}
