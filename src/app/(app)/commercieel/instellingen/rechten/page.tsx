import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { RightsManager } from "./rights-manager";

export const metadata: Metadata = { title: "Rechten – Commerciële Zaken" };
export const dynamic = "force-dynamic";

export default async function RightsPage() {
  const session = await auth();
  const access = await loadCommercialAccess(session!.user.id);
  if (!access.can("rights:read")) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Je hebt geen toegang tot het rechtenbeheer.</CardContent>
      </Card>
    );
  }
  return <RightsManager canManage={access.can("rights:manage_rights")} />;
}
