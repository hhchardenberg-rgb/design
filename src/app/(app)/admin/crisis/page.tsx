"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface CrisisProtocol {
  id: string;
  title: string;
  description: string | null;
  whoToCall: string | null;
  whoMayCommunicate: string | null;
  steps: string | null;
}

const emptyForm = { title: "", description: "", whoToCall: "", whoMayCommunicate: "", steps: "" };

export default function AdminCrisisPage() {
  const [protocols, setProtocols] = useState<CrisisProtocol[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  async function load() {
    const res = await fetch("/api/admin/crisis");
    const data = await res.json();
    setProtocols(data.protocols ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title) return;
    const res = await fetch("/api/admin/crisis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Toevoegen mislukt.");
      return;
    }
    setForm(emptyForm);
    await load();
  }

  function startEdit(p: CrisisProtocol) {
    setEditId(p.id);
    setEditForm({
      title: p.title,
      description: p.description ?? "",
      whoToCall: p.whoToCall ?? "",
      whoMayCommunicate: p.whoMayCommunicate ?? "",
      steps: p.steps ?? "",
    });
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/crisis/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditId(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Dit protocol verwijderen?")) return;
    await fetch(`/api/admin/crisis/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Crisiscommunicatie</h1>
        <p className="mt-1 text-muted-foreground">
          Protocollen per incidenttype: wie bellen, en wie mag hierover communiceren. Vul dit zorgvuldig en actueel
          in — dit is wat vrijwilligers raadplegen tijdens een echte crisis.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="font-medium">Nieuw protocol toevoegen</p>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Incidenttype</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Bijv. Ernstige blessure" />
            </div>
            <div className="sm:col-span-2">
              <Label>Omschrijving situatie</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Wie bellen</Label>
              <Textarea value={form.whoToCall} onChange={(e) => setForm({ ...form, whoToCall: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>Wie mag hierover communiceren</Label>
              <Textarea
                value={form.whoMayCommunicate}
                onChange={(e) => setForm({ ...form, whoMayCommunicate: e.target.value })}
                rows={3}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Eventuele extra stappen</Label>
              <Textarea value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} rows={3} />
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <Button type="submit" className="w-fit sm:col-span-2">
              Toevoegen
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {protocols.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4">
              {editId === p.id ? (
                <div className="flex flex-col gap-3">
                  <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                  <div>
                    <Label>Omschrijving</Label>
                    <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
                  </div>
                  <div>
                    <Label>Wie bellen</Label>
                    <Textarea value={editForm.whoToCall} onChange={(e) => setEditForm({ ...editForm, whoToCall: e.target.value })} rows={3} />
                  </div>
                  <div>
                    <Label>Wie mag hierover communiceren</Label>
                    <Textarea
                      value={editForm.whoMayCommunicate}
                      onChange={(e) => setEditForm({ ...editForm, whoMayCommunicate: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Eventuele extra stappen</Label>
                    <Textarea value={editForm.steps} onChange={(e) => setEditForm({ ...editForm, steps: e.target.value })} rows={3} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(p.id)}>
                      Opslaan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{p.title}</p>
                    <div className="flex shrink-0 gap-2">
                      <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(p)}>
                        bewerken
                      </button>
                      <button className="text-xs text-destructive hover:underline" onClick={() => remove(p.id)}>
                        verwijderen
                      </button>
                    </div>
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Badge variant={p.whoToCall ? "outline" : "default"} className="mb-1">
                        Wie bellen
                      </Badge>
                      <p className="whitespace-pre-wrap text-sm">{p.whoToCall || "Nog niet ingevuld."}</p>
                    </div>
                    <div>
                      <Badge variant={p.whoMayCommunicate ? "outline" : "default"} className="mb-1">
                        Wie mag communiceren
                      </Badge>
                      <p className="whitespace-pre-wrap text-sm">{p.whoMayCommunicate || "Nog niet ingevuld."}</p>
                    </div>
                  </div>
                  {p.steps && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.steps}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {protocols.length === 0 && <p className="text-sm text-muted-foreground">Nog geen protocollen toegevoegd.</p>}
      </div>
    </div>
  );
}
