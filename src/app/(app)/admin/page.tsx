import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { adminModuleGroups } from "@/lib/admin-modules";

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Beheer</h1>
        <p className="mt-1 text-muted-foreground">Overzicht van alles wat je binnen de HHC Hardenberg Hub kunt beheren.</p>
      </div>

      {adminModuleGroups.map((group) => (
        <section key={group.id}>
          <h2 className="mb-3 text-lg font-semibold">{group.label}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.modules.map((mod) => (
              <Link key={mod.href} href={mod.href}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{mod.title}</CardTitle>
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
