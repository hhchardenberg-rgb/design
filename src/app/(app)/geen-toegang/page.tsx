import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadCommercialAccess } from "@/lib/commercial/authz.server";
import { isCommercialEnabled } from "@/lib/commercial/flag";
import { ShieldOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Geen toegang" };

export const dynamic = "force-dynamic";

export default async function GeenToegangPage() {
  // Wie alleen toegang tot Commerciële Zaken heeft (geen hub-, ticketing- of beheerrol) belandt na het inloggen hier: stuur door.
  if (isCommercialEnabled()) {
    const session = await auth();
    if (session?.user && (await loadCommercialAccess(session.user.id)).isMember) redirect("/commercieel");
  }
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
            <ShieldOff className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold">Nog geen toegang</h1>
          <p className="text-sm text-muted-foreground">
            Je account is nog niet gekoppeld aan een onderdeel van de HHC Hardenberg Hub. Neem contact op met een
            beheerder om toegang te krijgen tot bijvoorbeeld de communicatie-hub of het Ticketing-gedeelte.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
