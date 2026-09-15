import { Mail, Phone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";

export default async function ContactpersonenPage() {
  const contacts = await prisma.contact.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Contactpersonen</h1>
        <p className="mt-1 text-muted-foreground">Wie doet wat binnen Team Communicatie en hoe je iemand bereikt.</p>
      </div>

      {contacts.length === 0 && <p className="text-sm text-muted-foreground">Nog geen contactpersonen toegevoegd.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {contacts.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex gap-3 p-4">
              <div
                className="h-16 w-16 shrink-0 rounded-full bg-surface-muted bg-cover bg-center"
                style={c.photoUrl ? { backgroundImage: `url(${c.photoUrl})` } : undefined}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted-foreground">{c.role}</p>
                <div className="mt-2 flex flex-col gap-1">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-sm text-hhc-orange-dark hover:underline">
                      <Mail className="h-3.5 w-3.5" />
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-sm text-hhc-orange-dark hover:underline">
                      <Phone className="h-3.5 w-3.5" />
                      {c.phone}
                    </a>
                  )}
                </div>
                {c.notes && <p className="mt-1 text-sm text-muted-foreground">{c.notes}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
