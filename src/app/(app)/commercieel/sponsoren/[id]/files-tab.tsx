"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, History, ImagePlus, Upload } from "lucide-react";
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
  previewSource: string | null;
  previewMissing: boolean;
  current: boolean;
}

const CATEGORIES: Record<string, string> = { LOGO: "Logo", CONTRACT: "Contract", QUOTE: "Offerte", AD: "Advertentie of materiaal", PROOF: "Uitvoeringsbewijs", OTHER: "Overig" };
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt";
/** Logo's en advertentiemateriaal mogen ook vectorbestanden zijn. */
const ACCEPT_VECTOR = `${ACCEPT},.eps,.ai,.svg`;
const VECTOR = new Set(["LOGO", "AD"]);
const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase() : "");
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function FilesTab({ companyId, can, onChange }: { companyId: string; can: (p: Permission) => boolean; onChange?: () => void }) {
  const toast = useStableToast();
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [history, setHistory] = useState(false);
  const [category, setCategory] = useState("OTHER");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceId = useRef<string | null>(null);
  const previewInput = useRef<HTMLInputElement>(null);
  const previewId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ files: FileRow[] }>(`/api/commercial/companies/${companyId}/files${history ? "?history=1" : ""}`);
    if (r.ok) setFiles(r.data.files);
    else toast.error(r.error);
  }, [companyId, history, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  async function send(file: File, extra: Record<string, string>, url = `/api/commercial/companies/${companyId}/files`, done = "Bestand geüpload.") {
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    for (const [k, v] of Object.entries(extra)) body.set(k, v);
    try {
      const res = await fetch(url, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const f = data.file as FileRow | undefined;
        toast.success(f?.previewMissing ? `${done} Er zat geen voorbeeld in; voeg er zo nodig een toe.` : done);
        setNote("");
        await load();
        onChange?.();
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
    if (r.ok) { await load(); onChange?.(); }
    else toast.error(r.error);
  }

  const logos = (files ?? []).filter((f) => f.category === "LOGO" && f.current);

  return (
    <div className="space-y-4">
      {logos.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div>
              <h2 className="font-semibold">Logo&apos;s</h2>
              <p className="text-xs text-muted-foreground">Het voorbeeld is alleen om te bekijken. Download voor drukwerk of de designtool altijd het origineel.</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {logos.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="flex h-28 items-center justify-center rounded bg-white p-2">
                    {f.previewable
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/commercial/files/${f.id}/preview?v=${f.previewSource ?? ""}`} alt={`Logo ${f.name}`} className="max-h-full max-w-full object-contain" />
                      : <span className="px-2 text-center text-xs text-muted-foreground">Geen voorbeeld beschikbaar</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium" title={f.name}>{f.name}</span>
                    <Badge variant="outline">{ext(f.name)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {can("files:download") && <a className="inline-flex items-center gap-1 text-hhc-orange-dark underline" href={`/api/commercial/files/${f.id}/download`}><Download className="h-4 w-4" /> Origineel</a>}
                    {(f.previewMissing || f.previewSource === "MANUAL") && can("files:update") && (
                      <button type="button" disabled={busy} className="inline-flex items-center gap-1 text-hhc-orange-dark underline disabled:opacity-50" onClick={() => { previewId.current = f.id; previewInput.current?.click(); }}>
                        <ImagePlus className="h-4 w-4" /> {f.previewMissing ? "Voorbeeld toevoegen" : "Ander voorbeeld"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
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
              <input ref={input} type="file" className="sr-only" aria-label="Bestand kiezen" accept={VECTOR.has(category) ? ACCEPT_VECTOR : ACCEPT}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f, { category, note }); }} />
              <Button disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> {busy ? "Bezig…" : "Bestand kiezen"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {VECTOR.has(category)
                ? "Liefst een vectorbestand: EPS, AI, SVG of PDF. PNG en JPG kan ook. Tot 4 MB. De Hub maakt er zelf een voorbeeld van; het origineel blijft bewaard."
                : "PDF, PNG, JPG, WEBP, DOCX, XLSX of TXT tot 4 MB. Kies categorie Logo voor EPS, AI of SVG."}{" "}
              Bestanden zijn alleen te openen voor ingelogde leden met de juiste bevoegdheid.
            </p>
          </CardContent>
        </Card>
      )}
      <input ref={replaceInput} type="file" className="sr-only" aria-label="Nieuwe versie kiezen" accept={ACCEPT_VECTOR}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && replaceId.current) void send(f, { replacesId: replaceId.current, category: "OTHER" }); }} />
      <input ref={previewInput} type="file" className="sr-only" aria-label="Voorbeeld kiezen" accept=".png,.jpg,.jpeg,.webp,.pdf,.svg"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && previewId.current) void send(f, {}, `/api/commercial/files/${previewId.current}/preview`, "Voorbeeld opgeslagen."); }} />
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
