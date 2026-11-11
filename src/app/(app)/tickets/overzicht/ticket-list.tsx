"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { formatDay, formatDayTime } from "@/lib/date-format";
import { TICKET_CATEGORIES, TICKET_STATUS_LABELS, type TicketCategory, type TicketStatus } from "@/lib/tickets/rules";
import { api, errorText, PageTitle, TicketStatusBadge } from "@/components/tickets/parts";

interface Row {
  id: string;
  publicId: string;
  name: string;
  email: string | null;
  company: string | null;
  category: TicketCategory;
  type: string;
  zone: string | null;
  status: TicketStatus | "EXPIRED";
  validityMode: string;
  validUntil: string | null;
  events: { id: string; title: string; startsAt: string }[];
  issuedBy: string | null;
  createdAt: string;
}
interface Page {
  total: number;
  page: number;
  pageSize: number;
  personal: boolean;
  tickets: Row[];
}

export function TicketList() {
  const toast = useStableToast();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [category, setCategory] = useState(sp.get("categorie") ?? "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pagina: String(page) });
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    if (category) params.set("categorie", category);
    try {
      setData(await api<Page>(`/api/tickets/tickets?${params}`));
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [page, search, status, category, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="space-y-4">
      <PageTitle title="Ticketoverzicht" description="Alle interne HHC-tickets. Fullhouse-tickets volgen met de Fullhouse-koppeling." />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <Input className="min-w-48 flex-1" placeholder={data?.personal === false ? "Zoek op ticketkenmerk" : "Zoek op naam, e-mail, bedrijf of kenmerk"} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Zoeken" />
        <Select className="w-auto" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status">
          <option value="">Alle statussen</option>
          {Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select className="w-auto" value={category} onChange={(e) => (setCategory(e.target.value), setPage(1))} aria-label="Categorie">
          <option value="">Alle categorieën</option>
          {Object.entries(TICKET_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Zoeken
        </Button>
      </form>

      <Card>
        <CardContent className="p-0">
          {!data ? (
            <p className="p-4 text-sm text-muted-foreground">Laden…</p>
          ) : data.tickets.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Geen tickets gevonden.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/tickets/overzicht/${t.id}`} className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-surface-muted">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {t.name}
                        {t.company ? <span className="font-normal text-muted-foreground"> · {t.company}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.type} · {TICKET_CATEGORIES[t.category]}
                        {t.zone ? ` · ${t.zone}` : ""}
                        {t.events.length === 1 ? ` · ${t.events[0].title} (${formatDayTime(t.events[0].startsAt)})` : t.events.length > 1 ? ` · ${t.events.length} wedstrijden` : ""}
                        {t.validUntil ? ` · geldig t/m ${formatDay(t.validUntil)}` : ""}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">{t.publicId}</p>
                    </div>
                    <TicketStatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {data.total} tickets · pagina {data.page} van {pages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Vorige
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Volgende
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
