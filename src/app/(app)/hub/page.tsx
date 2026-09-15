import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { hubModules } from "@/lib/hub-modules";

export default async function HubPage() {
  const session = await auth();

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl bg-hhc-black p-8 text-hhc-white">
        <h1 className="text-2xl font-bold">HHC Hardenberg Hub</h1>
        <p className="mt-1 text-white/70">
          Welkom{session?.user?.name ? `, ${session.user.name}` : ""}. Dé plek waar vrijwilligers van Team
          Communicatie alles vinden om content voor HHC Hardenberg te maken.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Onderdelen</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hubModules.map((mod) => {
            const card = (
              <Card
                className={
                  mod.status === "available"
                    ? "h-full transition-shadow hover:shadow-md"
                    : "h-full opacity-60"
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{mod.title}</CardTitle>
                    {mod.status === "soon" && <Badge variant="outline">Binnenkort</Badge>}
                  </div>
                  <CardDescription>{mod.description}</CardDescription>
                </CardHeader>
              </Card>
            );

            return mod.status === "available" ? (
              <Link key={mod.id} href={mod.href}>
                {card}
              </Link>
            ) : (
              <div key={mod.id} className="cursor-not-allowed">
                {card}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
