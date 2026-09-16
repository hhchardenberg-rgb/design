"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea, Checkbox } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CLUB_TIME_ZONE } from "@/lib/timezone";
import { useToast } from "@/components/toast";

interface AgendaRow {
  id: string;
  agendaEventId: string | null;
  source: "MANUAL" | "ICS";
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string | null;
  isFullDay: boolean;
  highlighted: boolean;
}

function zoned(iso: string) {
  return toZonedTime(new Date(iso), CLUB_TIME_ZONE);
}

function defaultDatetimeLocal(offsetHours = 24) {
  return format(toZonedTime(new Date(Date.now() + offsetHours * 3600 * 1000), CLUB_TIME_ZONE), "yyyy-MM-dd'T'HH:mm");
}

// Zet een door de beheerder ingevoerde datum/tijd (bedoeld als Nederlandse
// kloktijd) om naar het juiste UTC-moment voor opslag — het spiegelbeeld van
// de weergave-conversie op /kalender.
function toUtcIso(value: string, isFullDay: boolean): string {
  return isFullDay ? new Date(`${value}T00:00:00Z`).toISOString() : fromZonedTime(value, CLUB_TIME_ZONE).toISOString();
}

export default function AdminAgendaPage() {
  const toast = useToast();
  const [rows, setRows] = useState<AgendaRow[]>([]);
  const [icsError, setIcsError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [isFullDay, setIsFullDay] = useState(false);
  const [start, setStart] = useState(() => defaultDatetimeLocal());
  const [end, setEnd] = useState("");
  const [highlighted, setHighlighted] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editIsFullDay, setEditIsFullDay] = useState(false);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  async function load() {
    const res = await fetch("/api/admin/agenda");
    const data = await res.json();
    setRows(data.events ?? []);
    setIcsError(Boolean(data.icsError));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title || !start) return;
    const res = await fetch("/api/admin/agenda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        location: location || null,
        isFullDay,
        start: toUtcIso(start, isFullDay),
        end: end ? toUtcIso(end, isFullDay) : null,
        highlighted,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Toevoegen mislukt.");
      return;
    }
    setTitle("");
    setDescription("");
    setLocation("");
    setIsFullDay(false);
    setStart(defaultDatetimeLocal());
    setEnd("");
    setHighlighted(false);
    await load();
  }

  async function toggleHighlight(row: AgendaRow) {
    const nextHighlighted = !row.highlighted;
    if (row.source === "ICS") {
      await fetch("/api/admin/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "ICS",
          icsUid: row.id,
          title: row.title,
          location: row.location,
          start: row.start,
          end: row.end,
          isFullDay: row.isFullDay,
          description: row.description,
          highlighted: nextHighlighted,
        }),
      });
    } else if (row.agendaEventId) {
      await fetch(`/api/admin/agenda/${row.agendaEventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ highlighted: nextHighlighted }),
      });
    }
    await load();
  }

  function startEdit(row: AgendaRow) {
    setEditId(row.id);
    setEditTitle(row.title);
    setEditDescription(row.description ?? "");
    setEditLocation(row.location ?? "");
    setEditIsFullDay(row.isFullDay);
    setEditStart(format(zoned(row.start), row.isFullDay ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm"));
    setEditEnd(row.end ? format(zoned(row.end), row.isFullDay ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm") : "");
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function saveEdit(row: AgendaRow) {
    if (row.source === "ICS") {
      // Bij een uitgelicht ICS-event bewerkt de beheerder alleen de
      // toelichting — tijd/titel/locatie blijven van de live feed komen.
      await fetch("/api/admin/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "ICS",
          icsUid: row.id,
          title: row.title,
          location: row.location,
          start: row.start,
          end: row.end,
          isFullDay: row.isFullDay,
          description: editDescription || null,
          highlighted: row.highlighted,
        }),
      });
    } else if (row.agendaEventId) {
      await fetch(`/api/admin/agenda/${row.agendaEventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription || null,
          location: editLocation || null,
          isFullDay: editIsFullDay,
          start: toUtcIso(editStart, editIsFullDay),
          end: editEnd ? toUtcIso(editEnd, editIsFullDay) : null,
        }),
      });
    }
    setEditId(null);
    await load();
  }

  async function remove(row: AgendaRow) {
    if (!row.agendaEventId) return;
    const label =
      row.source === "MANUAL"
        ? "Dit agendapunt verwijderen?"
        : "Uitlichten en toelichting van dit agendapunt ongedaan maken? Het event zelf blijft gewoon in de live agenda staan.";
    if (!confirm(label)) return;
    const res = await fetch(`/api/admin/agenda/${row.agendaEventId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Verwijderen mislukt.");
      return;
    }
    toast.success(row.source === "MANUAL" ? "Agendapunt verwijderd." : "Uitlichten ongedaan gemaakt.");
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="mt-1 text-muted-foreground">
          Voeg zelf agendapunten toe, of licht events uit de live Google Agenda-koppeling uit. Uitgelichte events
          verschijnen bovenaan op de hub-homepage.
        </p>
      </div>

      {icsError && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            De live Google Agenda-koppeling kon niet worden opgehaald — hieronder zie je alleen handmatig
            toegevoegde agendapunten.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="font-medium">Nieuw agendapunt toevoegen</p>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Clubdag" />
            </div>
            <div>
              <Label>Locatie</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optioneel" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox checked={isFullDay} onChange={(e) => setIsFullDay(e.target.checked)} id="new-fullday" />
              <Label htmlFor="new-fullday" className="mb-0">
                Hele dag
              </Label>
            </div>
            <div>
              <Label>Begin</Label>
              <Input
                type={isFullDay ? "date" : "datetime-local"}
                value={isFullDay ? start.slice(0, 10) : start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <Label>Einde (optioneel)</Label>
              <Input
                type={isFullDay ? "date" : "datetime-local"}
                value={isFullDay ? end.slice(0, 10) : end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Toelichting</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Extra uitleg die achter het event getoond wordt" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={highlighted} onChange={(e) => setHighlighted(e.target.checked)} id="new-highlighted" />
              <Label htmlFor="new-highlighted" className="mb-0">
                Uitlichten op de hub-homepage
              </Label>
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <Button type="submit" className="w-fit sm:col-span-2">
              Toevoegen
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <Card key={row.id} className={row.highlighted ? "border-hhc-orange" : undefined}>
            <CardContent className="p-4">
              {editId === row.id ? (
                <div className="flex flex-col gap-3">
                  {row.source === "MANUAL" ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>Titel</Label>
                          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                        </div>
                        <div>
                          <Label>Locatie</Label>
                          <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <Checkbox checked={editIsFullDay} onChange={(e) => setEditIsFullDay(e.target.checked)} id={`edit-fullday-${row.id}`} />
                          <Label htmlFor={`edit-fullday-${row.id}`} className="mb-0">
                            Hele dag
                          </Label>
                        </div>
                        <div>
                          <Label>Begin</Label>
                          <Input
                            type={editIsFullDay ? "date" : "datetime-local"}
                            value={editIsFullDay ? editStart.slice(0, 10) : editStart}
                            onChange={(e) => setEditStart(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Einde (optioneel)</Label>
                          <Input
                            type={editIsFullDay ? "date" : "datetime-local"}
                            value={editIsFullDay ? editEnd.slice(0, 10) : editEnd}
                            onChange={(e) => setEditEnd(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {row.title} · {row.location} — tijd en titel komen uit de live agenda en zijn hier niet te
                      bewerken.
                    </p>
                  )}
                  <div>
                    <Label>Toelichting</Label>
                    <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(row)}>
                      Opslaan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{row.title}</p>
                      <Badge variant={row.source === "ICS" ? "outline" : "default"}>
                        {row.source === "ICS" ? "Live agenda" : "Handmatig"}
                      </Badge>
                      {row.highlighted && <Badge variant="primary">Uitgelicht</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {format(zoned(row.start), "EEEE d MMMM yyyy", { locale: nl })}
                      {!row.isFullDay && ` · ${format(zoned(row.start), "HH:mm", { locale: nl })}`}
                      {row.location ? ` · ${row.location}` : ""}
                    </p>
                    {row.description && <p className="mt-1 text-sm">{row.description}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={row.highlighted} onChange={() => toggleHighlight(row)} />
                      Uitlichten
                    </label>
                    <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => startEdit(row)}>
                      bewerken
                    </button>
                    {row.agendaEventId && (
                      <button className="text-xs text-destructive hover:underline" onClick={() => remove(row)}>
                        {row.source === "MANUAL" ? "verwijderen" : "uitlichten ongedaan maken"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Geen aankomende agendapunten.</p>}
      </div>
    </div>
  );
}
