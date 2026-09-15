import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function CrisisPage() {
  const protocols = await prisma.crisisProtocol.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Crisiscommunicatie</h1>
        <p className="mt-1 text-muted-foreground">
          Protocollen per incidenttype. Weet je het niet zeker? Bel eerst en communiceer pas nadat dit is
          afgestemd met wie hieronder staat genoemd.
        </p>
      </div>

      {protocols.length === 0 && <p className="text-sm text-muted-foreground">Nog geen protocollen beschikbaar.</p>}

      <div className="flex flex-col gap-3">
        {protocols.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>{p.title}</CardTitle>
              {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border p-3">
                  <Badge variant={p.whoToCall ? "primary" : "outline"} className="mb-1.5">
                    Wie bellen?
                  </Badge>
                  <p className="whitespace-pre-wrap text-sm">
                    {p.whoToCall || "Nog niet ingevuld — vraag dit na bij een beheerder."}
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <Badge variant={p.whoMayCommunicate ? "primary" : "outline"} className="mb-1.5">
                    Wie mag communiceren?
                  </Badge>
                  <p className="whitespace-pre-wrap text-sm">
                    {p.whoMayCommunicate || "Nog niet ingevuld — vraag dit na bij een beheerder."}
                  </p>
                </div>
              </div>
              {p.steps && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.steps}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
