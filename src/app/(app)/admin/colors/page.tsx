"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

interface BrandColor {
  id: string;
  name: string;
  hex: string;
  group: string;
}

export default function AdminColorsPage() {
  const [colors, setColors] = useState<BrandColor[]>([]);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#EA6A12");
  const [group, setGroup] = useState("algemeen");

  async function load() {
    const res = await fetch("/api/admin/brand-colors");
    const data = await res.json();
    setColors(data.colors ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !hex) return;
    await fetch("/api/admin/brand-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, hex, group }),
    });
    setName("");
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/brand-colors/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Huisstijlkleuren</h1>
        <p className="mt-1 text-muted-foreground">
          Deze kleuren zijn de enige kleuren die gebruikers mogen kiezen voor COLOR:-velden.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_140px_160px_auto] sm:items-end">
            <div>
              <Label>Naam</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="HHC Oranje" />
            </div>
            <div>
              <Label>Kleur</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="h-10 w-10 rounded border border-border" />
                <Input value={hex} onChange={(e) => setHex(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Groep</Label>
              <Input value={group} onChange={(e) => setGroup(e.target.value)} />
            </div>
            <Button type="submit">Toevoegen</Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {colors.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm">
            <span className="h-6 w-6 rounded-full" style={{ backgroundColor: c.hex }} />
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground">{c.hex}</span>
            <button className="text-xs text-destructive hover:underline" onClick={() => remove(c.id)}>
              verwijderen
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
