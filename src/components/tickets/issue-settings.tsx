"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { formatDayTime } from "@/lib/date-format";
import { seasonOptionLabel } from "@/lib/commercial/season-phase";
import { TICKET_CATEGORIES, VALIDITY_MODES, type TicketCategory, type ValidityMode } from "@/lib/tickets/rules";
import { LOCALES, type Locale } from "@/lib/tickets/i18n";
import { api, errorText } from "./parts";

export interface CatalogType {
  id: string;
  name: string;
  category: TicketCategory;
  validityMode: ValidityMode;
  isSeasonCard: boolean;
  seasonId: string | null;
  zoneId: string | null;
  active: boolean;
  validUntil: string | null;
}
interface Catalog {
  seasons: { id: string; name: string; startsOn: string; endsOn: string }[];
  zones: { id: string; name: string; active: boolean }[];
  types: CatalogType[];
  events: { id: string; title: string; startsAt: string; endsAt: string; status: string }[];
}

export interface IssueSettingsValue {
  typeId: string;
  zoneId: string;
  eventIds: string[];
  seasonId: string;
  validFrom: string;
  validUntil: string;
  locale: Locale;
}

export const EMPTY_SETTINGS: IssueSettingsValue = { typeId: "", zoneId: "", eventIds: [], seasonId: "", validFrom: "", validUntil: "", locale: "nl" };

/** Het ticketdeel van een uitgifte: tickettype, vak en geldigheid (wedstrijden, seizoen of periode). */
export function IssueSettings({ value, onChange, initialTypeId }: { value: IssueSettingsValue; onChange: (v: IssueSettingsValue) => void; initialTypeId?: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Catalog>("/api/tickets/catalog").then(setCatalog, (e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    if (catalog && initialTypeId && !value.typeId && catalog.types.some((t) => t.id === initialTypeId)) pickType(initialTypeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, initialTypeId]);

  const type = useMemo(() => catalog?.types.find((t) => t.id === value.typeId) ?? null, [catalog, value.typeId]);
  const openEvents = (catalog?.events ?? []).filter((e) => (e.status === "DRAFT" || e.status === "ACTIVE") && new Date(e.endsAt) > new Date());

  function pickType(id: string) {
    const t = catalog?.types.find((x) => x.id === id);
    onChange({ ...EMPTY_SETTINGS, locale: value.locale, typeId: id, zoneId: t?.zoneId ?? "", seasonId: t?.seasonId ?? "" });
  }

  function toggleEvent(id: string) {
    if (!type) return;
    if (type.validityMode === "SINGLE") return onChange({ ...value, eventIds: [id] });
    onChange({ ...value, eventIds: value.eventIds.includes(id) ? value.eventIds.filter((x) => x !== id) : [...value.eventIds, id] });
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!catalog) return <p className="text-sm text-muted-foreground">Laden…</p>;

  const activeTypes = catalog.types.filter((t) => t.active);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ticket</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="is-type">Tickettype</Label>
          <Select id="is-type" value={value.typeId} onChange={(e) => pickType(e.target.value)}>
            <option value="">Kies een tickettype</option>
            {activeTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({TICKET_CATEGORIES[t.category]})
              </option>
            ))}
          </Select>
          {activeTypes.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Maak eerst een tickettype aan onder Tickettypes en vakken.</p>}
        </div>
        <div>
          <Label htmlFor="is-zone">Toegangsvak</Label>
          <Select id="is-zone" value={value.zoneId} onChange={(e) => onChange({ ...value, zoneId: e.target.value })} disabled={!type}>
            <option value="">Geen (alle vakken)</option>
            {catalog.zones
              .filter((z) => z.active)
              .map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
          </Select>
        </div>

        {type && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Geldig voor: <strong>{VALIDITY_MODES[type.validityMode].toLowerCase()}</strong>
            {type.isSeasonCard ? " · seizoenskaart" : ""} · niet overdraagbaar
          </p>
        )}

        {type && (type.validityMode === "SINGLE" || type.validityMode === "MULTI") && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">{type.validityMode === "SINGLE" ? "Wedstrijd" : "Wedstrijden"}</legend>
            {openEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Er zijn geen komende wedstrijden. Voeg ze toe onder Wedstrijden.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {openEvents.map((e) => (
                  <li key={e.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-muted">
                      {type.validityMode === "SINGLE" ? (
                        <input type="radio" name="is-event" className="accent-[var(--hhc-orange)]" checked={value.eventIds[0] === e.id} onChange={() => toggleEvent(e.id)} />
                      ) : (
                        <Checkbox checked={value.eventIds.includes(e.id)} onChange={() => toggleEvent(e.id)} />
                      )}
                      <span className="flex-1">{e.title}</span>
                      <span className="text-xs text-muted-foreground">{formatDayTime(e.startsAt)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        {type?.validityMode === "SEASON" && (
          <div>
            <Label htmlFor="is-season">Seizoen</Label>
            <Select id="is-season" value={value.seasonId} onChange={(e) => onChange({ ...value, seasonId: e.target.value })}>
              <option value="">Kies een seizoen</option>
              {catalog.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {seasonOptionLabel(s)}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="is-locale">Taal van mail, ticketpagina en pdf</Label>
          <Select id="is-locale" value={value.locale} onChange={(e) => onChange({ ...value, locale: e.target.value as Locale })}>
            {(Object.keys(LOCALES) as Locale[]).map((l) => (
              <option key={l} value={l}>{LOCALES[l]}</option>
            ))}
          </Select>
        </div>

        {type?.validityMode === "RANGE" && (
          <>
            <div>
              <Label htmlFor="is-from">Geldig vanaf (optioneel)</Label>
              <Input id="is-from" type="date" value={value.validFrom} onChange={(e) => onChange({ ...value, validFrom: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="is-until">Geldig tot en met</Label>
              <Input id="is-until" type="date" value={value.validUntil} onChange={(e) => onChange({ ...value, validUntil: e.target.value })} />
              {type.validUntil && <p className="mt-1 text-xs text-muted-foreground">Leeg = de einddatum van het tickettype.</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Het verzoek voor de API, uit de instellingen en de houders. */
export function issueBody(v: IssueSettingsValue, holders: unknown[], batchName?: string) {
  return {
    typeId: v.typeId,
    zoneId: v.zoneId || null,
    eventIds: v.eventIds,
    seasonId: v.seasonId || null,
    validFrom: v.validFrom || null,
    validUntil: v.validUntil || null,
    holders,
    batchName: batchName || null,
    locale: v.locale,
  };
}
