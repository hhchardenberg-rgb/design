import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { CrisisProtocolList } from "./protocol-list";

export const metadata: Metadata = { title: "Crisiscommunicatie" };

export default async function CrisisPage() {
  const protocols = await prisma.crisisProtocol.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, title: true, description: true, whoToCall: true, whoMayCommunicate: true, steps: true },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Crisiscommunicatie</h1>
        <p className="mt-1 text-muted-foreground">
          Protocollen per incidenttype. Klik op een incidenttype voor wie je belt en wie erover mag communiceren.
          Weet je het niet zeker? Bel eerst en communiceer pas nadat dit is afgestemd.
        </p>
      </div>

      {protocols.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen protocollen beschikbaar.</p>
      ) : (
        <CrisisProtocolList protocols={protocols} />
      )}
    </div>
  );
}
