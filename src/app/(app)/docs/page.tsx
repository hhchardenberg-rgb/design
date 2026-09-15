import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const docs = [
  {
    href: "/docs/psd-conventions",
    title: "PSD-naamgevingsconventie voor designers",
    description: "Hoe je een PSD-bestand naamgeeft zodat de importer er automatisch een bruikbare template van maakt.",
  },
];

export default function DocsIndexPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Documentatie</h1>
        <p className="mt-2 text-muted-foreground">
          Handleidingen en uitleg voor vrijwilligers van Team Communicatie.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {docs.map((d) => (
          <Link key={d.href} href={d.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{d.title}</CardTitle>
                <CardDescription>{d.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
