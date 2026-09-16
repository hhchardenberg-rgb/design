"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/toast";

interface PressRelease {
  id: string;
  title: string;
  date: string;
  lead: string;
  body: string;
  authorId: string | null;
  author: { name: string } | null;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function PersberichtenPage() {
  const { data: session } = useSession();
  const toast = useToast();
  const [releases, setReleases] = useState<PressRelease[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [lead, setLead] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editLead, setEditLead] = useState("");
  const [editBody, setEditBody] = useState("");

  async function load() {
    const res = await fetch("/api/press-releases");
    const data = await res.json();
    setReleases(data.releases ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title || !date || !lead || !body) return;
    setSubmitting(true);
    const res = await fetch("/api/press-releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, date, lead, body }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Aanmaken mislukt.");
      return;
    }
    setTitle("");
    setDate(todayInputValue());
    setLead("");
    setBody("");
    toast.success("Persbericht aangemaakt.");
    await load();
  }

  function startEdit(release: PressRelease) {
    setEditId(release.id);
    setEditTitle(release.title);
    setEditDate(release.date.slice(0, 10));
    setEditLead(release.lead);
    setEditBody(release.body);
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/press-releases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, date: editDate, lead: editLead, body: editBody }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Opslaan mislukt.");
      return;
    }
    setEditId(null);
    toast.success("Persbericht bijgewerkt.");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Dit persbericht verwijderen?")) return;
    const res = await fetch(`/api/press-releases/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Verwijderen mislukt.");
      return;
    }
    toast.success("Persbericht verwijderd.");
    await load();
  }

  function canManage(release: PressRelease) {
    return release.authorId === session?.user?.id || session?.user?.role === "ADMIN";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Persberichten</h1>
        <p className="mt-1 text-muted-foreground">
          Maak een persbericht in de vaste HHC-huisstijl en exporteer het als Word- of PDF-bestand.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="font-medium">Nieuw persbericht</p>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Nieuwe hoofdsponsor voor HHC Hardenberg" />
            </div>
            <div>
              <Label>Datum</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Inleiding</Label>
              <Textarea value={lead} onChange={(e) => setLead(e.target.value)} rows={2} placeholder="Vetgedrukte openingsalinea" />
            </div>
            <div className="sm:col-span-2">
              <Label>Tekst</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="Overige alinea's. Laat een lege regel tussen alinea's voor een nieuwe alinea."
              />
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-fit sm:col-span-2">
              {submitting ? "Bezig..." : "Persbericht aanmaken"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {releases.map((release) => (
          <Card key={release.id}>
            <CardContent className="p-4">
              {editId === release.id ? (
                <div className="flex flex-col gap-3">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-fit" />
                  <Textarea value={editLead} onChange={(e) => setEditLead(e.target.value)} rows={2} />
                  <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={8} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(release.id)}>
                      Opslaan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{release.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(release.date), "d MMMM yyyy", { locale: nl })}
                        {release.author?.name ? ` · ${release.author.name}` : ""}
                      </p>
                    </div>
                    {canManage(release) && (
                      <div className="flex shrink-0 items-center gap-3">
                        <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(release)}>
                          bewerken
                        </button>
                        <button className="text-xs text-destructive hover:underline" onClick={() => remove(release.id)}>
                          verwijderen
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-medium">{release.lead}</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{release.body}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`/api/press-releases/${release.id}/docx`}>
                      <Button size="sm" variant="outline">
                        <FileText className="h-4 w-4" />
                        Word
                      </Button>
                    </a>
                    <a href={`/api/press-releases/${release.id}/pdf`}>
                      <Button size="sm" variant="outline">
                        <FileDown className="h-4 w-4" />
                        PDF
                      </Button>
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {loaded && releases.length === 0 && <p className="text-sm text-muted-foreground">Nog geen persberichten.</p>}
      </div>
    </div>
  );
}
