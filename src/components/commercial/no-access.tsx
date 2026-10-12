import { ShieldOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function NoAccess({ what }: { what: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-6 text-sm">
        <ShieldOff className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span>Je hebt geen toegang tot {what}. Vraag een beheerder om de bevoegdheid als je die nodig hebt.</span>
      </CardContent>
    </Card>
  );
}
