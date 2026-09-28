import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { adminModuleGroups } from "@/lib/admin-modules";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Beheer" };

export default async function AdminOverviewPage() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const visibleGroups = adminModuleGroups
    .map((group) => ({
      ...group,
      modules: group.modules.filter((mod) => !mod.requiredRole || hasRole(roles, mod.requiredRole)),
    }))
    .filter((group) => group.modules.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Beheer</h1>
        <p className="mt-1 text-muted-foreground">Overzicht van alles wat je binnen de HHC Hardenberg Hub kunt beheren.</p>
      </div>

      {visibleGroups.map((group) => (
        <section key={group.id}>
          <h2 className="mb-3 text-lg font-semibold">{group.label}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.modules.map((mod) => (
              <Link key={mod.href} href={mod.href}>
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardHeader>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-hhc-orange-dark">
                      <mod.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="mt-1">{mod.title}</CardTitle>
                    <CardDescription>{mod.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
