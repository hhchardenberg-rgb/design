"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, History, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useStableToast } from "@/lib/commercial/use-stable-toast";
import { api, formatDate } from "@/lib/commercial/client";
import type { Permission } from "@/lib/commercial/permissions";

interface FileRow {
  id: string;
  category: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  versionGroup: string;
  note: string | null;
  createdAt: string;
  uploadedBy: string | null;
  previewable: boolean;
  current: boolean;
}

const CATEGORIES: Record<string, string> = { LOGO: "Logo", CONTRACT: "Contract", QUOTE: "Offerte", AD: "Advertentie of materiaal", PROOF: "Uitvoeringsbewijs", OTHER: "Overig" };
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function FilesTab({ companyId, can }: { companyId: string; can: (p: Permission) => boolean }) {
  const toast = useStableToast();
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [history, setHistory] = useState(false);
  const [category, setCategory] = useState("OTHER");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ files: FileRow[] }>(`/api/commercial/companies/${companyId}/files${history ? "?history=1" : ""}`);
    if (r.ok) setFiles(r.data.files);
    else toast.error(r.error);
  }, [companyId, history, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function send(file: File, extra: Record<string, string>) {
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    for (const [k, v] of Object.entries(extra)) body.set(k, v);
    try {
      const res = await fetch(`/api/commercial/companies/${companyId}/files`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Bestand geüpload.");
        setNote("");
        await load();
      } else toast.error(typeof data.error === "string" ? data.error : "Uploaden is mislukt.");
    } catch {
      toast.error("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }
  async function archive(f: FileRow) {
    if (!window.confirm(`“${f.name}” archiveren? Het bestand blijft bewaard maar verdwijnt uit de lijst.`)) return;
    const r = await api(`/api/commercial/files/${f.id}`, "DELETE");
    if (r.ok) await load();
    else toast.error(r.error);
  }

  const logo = files?.find((f) => f.category === "LOGO" && f.previewable && f.current);

  return (
    <div className="space-y-4">
      {logo && can("files:download") && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/commercial/files/${logo.id}/download?inline=1`} alt={`Logo (${logo.name})`} className="h-16 max-w-48 rounded border border-border bg-white object-contain p-1" />
          <span className="text-sm text-muted-foreground">Actueel logo</span>
        </div>
      )}
      {can("files:create") && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="file-cat">Categorie</Label>
                <select id="file-cat" className="h-10 rounded-md border border-border bg-surface px-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="min-w-48 flex-1"><Label htmlFor="file-note">Notitie (optioneel)</Label><Input id="file-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <input ref={input} type="file" className="sr-only" aria-label="Bestand kiezen" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f, { category, note }); }} />
              <Button disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> {busy ? "Bezig…" : "Bestand kiezen"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">PDF, PNG, JPG, WEBP, DOCX, XLSX of TXT tot 4 MB. Bestanden zijn alleen te openen voor ingelogde leden met de juiste bevoegdheid.</p>
          </CardContent>
        </Card>
      )}
      <input ref={replaceInput} type="file" className="sr-only" aria-label="Nieuwe versie kiezen" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && replaceId.current) void send(f, { replacesId: replaceId.current, category: "OTHER" }); }} />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" className="h-4 w-4 accent-hhc-orange" checked={history} onChange={(e) => setHistory(e.target.checked)} />
        <History className="h-4 w-4" /> Eerdere versies en gearchiveerde bestanden tonen
      </label>
      <Card>
        <CardContent className="p-0">
          {!files ? <p className="p-5 text-sm text-muted-foreground">Laden…</p> : files.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nog geen bestanden bij dit dossier.</p> : (
            <ul className="divide-y divide-border">
              {files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{f.name} <span className="text-xs text-muted-foreground">v{f.version}</span></div>
                    <div className="text-xs text-muted-foreground">
                      {CATEGORIES[f.category] ?? f.category} · {size(f.sizeBytes)} · {formatDate(f.createdAt, true)}{f.uploadedBy ? ` · ${f.uploadedBy}` : ""}{f.note ? ` · ${f.note}` : ""}
                    </div>
                  </div>
                  {!f.current && <Badge variant="outline">Eerdere versie</Badge>}
                  {can("files:download") && <a className="inline-flex items-center gap-1 text-hhc-orange-dark underline" href={`/api/commercial/files/${f.id}/download`}><Download className="h-4 w-4" /> Downloaden</a>}
                  {f.current && can("files:update") && can("files:create") && <Button variant="outline" size="sm" disabled={busy} onClick={() => { replaceId.current = f.id; replaceInput.current?.click(); }}>Nieuwe versie</Button>}
                  {f.current && can("files:archive") && <Button variant="outline" size="sm" onClick={() => archive(f)}>Archiveren</Button>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
