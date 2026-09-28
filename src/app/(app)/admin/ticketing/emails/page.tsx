"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";

interface EmailTemplate {
  id: string;
  title: string;
  subject: string | null;
  body: string;
  category: string | null;
}

export default function AdminTicketingEmailsPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  async function load() {
    const res = await fetch("/api/admin/ticketing/emails");
    const data = await res.json();
    setTemplates(data.templates ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title || !body) return;
    const res = await fetch("/api/admin/ticketing/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category: category || null, subject: subject || null, body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Toevoegen mislukt.");
      return;
    }
    setTitle("");
    setCategory("");
    setSubject("");
    setBody("");
    await load();
  }

  function startEdit(t: EmailTemplate) {
    setEditId(t.id);
    setEditTitle(t.title);
    setEditCategory(t.category ?? "");
    setEditSubject(t.subject ?? "");
    setEditBody(t.body);
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/ticketing/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, category: editCategory || null, subject: editSubject || null, body: editBody }),
    });
    setEditId(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Deze e-mailtekst verwijderen?")) return;
    const res = await fetch(`/api/admin/ticketing/emails/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Verwijderen mislukt.");
      return;
    }
    toast.success("E-mailtekst verwijderd.");
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/ticketing" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Ticketing
        </Link>
        <h1 className="text-2xl font-bold">Standaard e-mails</h1>
        <p className="mt-1 text-muted-foreground">
          Kant-en-klare e-mailteksten voor veelvoorkomende situaties — met een kopieerknop, zichtbaar voor
          iedereen met de rol Ticketing.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="font-medium">Nieuwe e-mailtekst toevoegen</p>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Seizoenspas opnieuw verstuurd" />
            </div>
            <div>
              <Label>Categorie</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Optioneel" />
            </div>
            <div className="sm:col-span-2">
              <Label>Onderwerp</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Optioneel" />
            </div>
            <div className="sm:col-span-2">
              <Label>E-mailtekst</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder={"Beste [naam],\n\n..."}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Platte tekst — geen Markdown, zodat dit direct te plakken is in een mailprogramma. Gebruik [naam] e.d. als placeholder.
              </p>
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <Button type="submit" className="w-fit sm:col-span-2">
              Toevoegen
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardContent className="p-4">
              {editId === t.id ? (
                <div className="flex flex-col gap-3">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Titel" />
                  <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Categorie" />
                  <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="Onderwerp" />
                  <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={10} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(t.id)}>
                      Opslaan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.category && <Badge variant="outline">{t.category}</Badge>}
                      <p className="font-medium">{t.title}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(t)}>
                        bewerken
                      </button>
                      <button className="text-xs text-destructive hover:underline" onClick={() => remove(t.id)}>
                        verwijderen
                      </button>
                    </div>
                  </div>
                  {t.subject && <p className="text-xs text-muted-foreground">Onderwerp: {t.subject}</p>}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {loaded && templates.length === 0 && <p className="text-sm text-muted-foreground">Nog geen e-mailteksten toegevoegd.</p>}
      </div>
    </div>
  );
}
