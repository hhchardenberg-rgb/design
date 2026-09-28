"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { generatePassword } from "@/lib/password";

export default function TicketingWachtwoordenPage() {
  const toast = useToast();
  const [length, setLength] = useState(10);
  // Leeg bij de eerste render (server én client) en pas na mount gevuld: een
  // willekeurig wachtwoord direct in de initiële state zou op de server een
  // andere waarde opleveren dan bij het hydrateren op de client, wat een
  // hydration-mismatch veroorzaakt.
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPassword(generatePassword(length));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij het laden van de pagina, niet bij elke lengtewijziging
  }, []);

  function regenerate(newLength = length) {
    setPassword(generatePassword(newLength));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Wachtwoord gekopieerd.");
    } catch {
      toast.error("Kopiëren is niet gelukt.");
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Wachtwoord genereren</h1>
        <p className="mt-1 text-muted-foreground">
          Genereer een willekeurig, sterk wachtwoord voor een lid waarvoor je een pas aanmaakt in het
          ticketsysteem (bijv. bij nieuwe inloggegevens voor de Ledenpas App).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="rounded-md border border-border bg-surface-muted px-4 py-4 text-center font-mono text-2xl tracking-wide">
            {password || <span className="text-muted-foreground">&hellip;</span>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={copy} disabled={!password} className="flex-1 sm:flex-none">
              <Copy className="h-4 w-4" />
              Kopiëren
            </Button>
            <Button type="button" variant="outline" onClick={() => regenerate()} className="flex-1 sm:flex-none">
              <RefreshCw className="h-4 w-4" />
              Nieuw wachtwoord
            </Button>
          </div>

          <div className="w-40">
            <Label htmlFor="length">Lengte</Label>
            <Select
              id="length"
              value={length}
              onChange={(e) => {
                const newLength = Number(e.target.value);
                setLength(newLength);
                regenerate(newLength);
              }}
            >
              {[8, 10, 12, 16, 20].map((n) => (
                <option key={n} value={n}>
                  {n} tekens
                </option>
              ))}
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Leesbare tekens zonder 0/O/1/l/I, om verwarring bij overtypen te voorkomen. Dit wachtwoord wordt
            nergens opgeslagen — kopieer en plak het direct waar je het nodig hebt.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
