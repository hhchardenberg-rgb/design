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
  const [hex, setHex] = useState("#FF6F00");
  const [group, setGroup] = useState("algemeen");

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHex, setEditHex] = useState("#FF6F00");
  const [editGroup, setEditGroup] = useState("algemeen");

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

  function startEdit(c: BrandColor) {
    setEditId(c.id);
    setEditName(c.name);
    setEditHex(c.hex);
    setEditGroup(c.group);
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function saveEdit(id: string) {
    if (!editName || !editHex) return;
    await fetch(`/api/admin/brand-colors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, hex: editHex, group: editGroup }),
    });
    setEditId(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Deze kleur verwijderen?")) return;
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
        {colors.map((c) =>
          editId === c.id ? (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-full border border-primary bg-surface py-1 pl-1 pr-3 text-sm"
            >
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(editHex) ? editHex : "#000000"}
                onChange={(e) => setEditHex(e.target.value)}
                className="h-7 w-7 rounded-full border border-border"
              />
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 w-32" />
              <Input value={editHex} onChange={(e) => setEditHex(e.target.value)} className="h-7 w-24" />
              <Input value={editGroup} onChange={(e) => setEditGroup(e.target.value)} className="h-7 w-24" />
              <button className="text-xs font-medium text-hhc-orange-dark hover:underline" onClick={() => saveEdit(c.id)}>
                opslaan
              </button>
              <button className="text-xs text-muted-foreground hover:underline" onClick={cancelEdit}>
                annuleren
              </button>
            </div>
          ) : (
            <div key={c.id} className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm">
              <span className="h-6 w-6 rounded-full" style={{ backgroundColor: c.hex }} />
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.hex}</span>
              <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(c)}>
                bewerken
              </button>
              <button className="text-xs text-destructive hover:underline" onClick={() => remove(c.id)}>
                verwijderen
              </button>
            </div>
          )
        )}
        {colors.length === 0 && <p className="text-sm text-muted-foreground">Nog geen huisstijlkleuren toegevoegd.</p>}
      </div>
    </div>
  );
}
