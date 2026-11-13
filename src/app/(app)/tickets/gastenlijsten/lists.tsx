"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, errorText, PageTitle } from "@/components/tickets/parts";

const KINDS = { SPONSOR: "Sponsor", GUEST: "Gast", OTHER: "Overig" } as const;
interface List {
  id: string;
  name: string;
  kind: keyof typeof KINDS;
  note: string | null;
  members: number;
  seats: number;
}

export function Lists() {
  const toast = useStableToast();
  const [lists, setLists] = useState<List[] | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<keyof typeof KINDS>("SPONSOR");
  const load = useCallback(async () => {
    try {
      setLists((await api<{ lists: List[] }>("/api/tickets/guestlists")).lists);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [toast]);
  useEffect(() => void load(), [load]);

  async function create() {
    try {
      const r = await api<{ id: string }>("/api/tickets/guestlists", { body: { name, kind } });
      window.location.href = `/tickets/gastenlijsten/${r.id}`;
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Gastenlijsten" description="Vaste lijsten met sponsoren, gasten of teams. Geef per wedstrijd in één keer tickets uit aan de hele lijst." />
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4 text-sm">
          <div>
            <Label htmlFor="gl-name">Nieuwe lijst</Label>
            <Input id="gl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijvoorbeeld: Businessclub of JO15" className="w-64" />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as keyof typeof KINDS)} className="h-10 rounded-md border border-border bg-surface px-3" aria-label="Soort">
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Button disabled={!name.trim()} onClick={() => void create()}>
            Lijst maken
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lijsten</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lists && lists.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nog geen lijsten.</p>}
          <ul className="divide-y divide-border text-sm">
            {lists?.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-4">
                <Link className="font-medium underline" href={`/tickets/gastenlijsten/${l.id}`}>
                  {l.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {KINDS[l.kind] ?? l.kind} · {l.members} relaties · {l.seats} tickets per wedstrijd
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
