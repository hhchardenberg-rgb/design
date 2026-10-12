import { notFound } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";

export const dynamic = "force-dynamic";

// Server-side toegangspoort voor de hele sectie. Flag uit: de sectie bestaat
// niet (404). Geen lid: toegangsweigering, ook voor platformbeheerders.
export default async function CommercialLayout({ children }: { children: React.ReactNode }) {
  if (!isCommercialEnabled()) notFound();
  const session = await auth();
  if (!session?.user) notFound();
  const access = await loadCommercialAccess(session.user.id);
  if (!access.isMember) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
              <ShieldOff className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">Geen toegang tot Commerciële Zaken</h1>
            <p className="text-sm text-muted-foreground">
              Je account heeft geen toegang tot deze sectie. Vraag een beheerder om toegang als je die nodig hebt.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
