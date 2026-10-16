"use client";

import { useEffect, useState } from "react";
import JSZip from "jszip";
import { Upload, FileArchive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { parseFontFilename } from "@/lib/fonts/parseFontFilename";

const FONT_EXTENSIONS = /\.(woff2?|ttf|otf)$/i;

function previewFamily(fontId: string) {
  return `font-preview-${fontId}`;
}

interface Font {
  id: string;
  name: string;
  family: string;
  weight: number;
  style: string;
  format: string;
  fileUrl: string;
  isActive: boolean;
  fileFamily: string | null;
  subfamily: string | null;
  postscriptName: string | null;
  metadataReadAt: string | null;
}

export default function AdminFontsPage() {
  const [fonts, setFonts] = useState<Font[]>([]);
  const [name, setName] = useState("");
  const [family, setFamily] = useState("");
  const [familyTouched, setFamilyTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [zipErrors, setZipErrors] = useState<string[]>([]);

  async function load() {
    const res = await fetch("/api/admin/fonts");
    const data = await res.json();
    setFonts(data.fonts ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  // Laadt elk font onder een unieke alias per rij (font-preview-<id>) zodat
  // de kaart hieronder écht in dat specifieke bestand rendert — dus ook het
  // juiste gewicht/stijl van déze rij, niet zomaar "de dichtstbijzijnde
  // match" binnen de gedeelde CSS-familienaam. Werkt ook voor nog-niet-
  // actieve fonts (handig om te bekijken vóór activeren), en is onafhankelijk
  // van de globale @font-face-injectie in de rootlayout (die alleen bij een
  // volledige paginalaad ververst, niet meteen na een upload).
  useEffect(() => {
    if (fonts.length === 0) return;
    let cancelled = false;
    const loaded: FontFace[] = [];

    Promise.all(
      fonts.map(async (f) => {
        try {
          const face = new FontFace(previewFamily(f.id), `url(/api/fonts/${f.id})`);
          const ready = await face.load();
          if (cancelled) return;
          document.fonts.add(ready);
          loaded.push(ready);
        } catch {
          // Best-effort preview: als een bestand niet laadt, blijft de kaart
          // gewoon in het systeemfont staan.
        }
      })
    );

    return () => {
      cancelled = true;
      for (const face of loaded) {
        document.fonts.delete(face);
      }
    };
  }, [fonts]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      await uploadOne(file, { name, family });
      setName("");
      setFamily("");
      setFamilyTouched(false);
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uploaden mislukt.");
    } finally {
      setLoading(false);
    }
  }

  async function patchFont(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/fonts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Wijzigen is niet gelukt.");
    await load();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/fonts/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Verwijderen is niet gelukt.");
    await load();
  }

  async function uploadOne(fontFile: File, meta: { name: string; family: string }) {
    const form = new FormData();
    form.append("file", fontFile);
    if (meta.name) form.append("name", meta.name);
    if (meta.family) form.append("family", meta.family);
    const res = await fetch("/api/admin/fonts", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Uploaden mislukt.");
    }
  }

  /**
   * Bulkupload: een .zip met meerdere lettertypebestanden (zoals
   * doorgaans aangeleverd door een designer/leverancier — bv. alle
   * gewichten van één familie in één archief) wordt in de browser
   * uitgepakt met JSZip; per bestand wordt naam/familie/gewicht/stijl
   * automatisch afgeleid uit de bestandsnaam (zie parseFontFilename),
   * zodat je niet voor elk gewicht apart een formulier hoeft in te vullen.
   */
  async function uploadZip(zipFile: File) {
    setZipBusy(true);
    setZipStatus(null);
    setZipErrors([]);
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.values(zip.files).filter((f) => !f.dir && FONT_EXTENSIONS.test(f.name));
      if (entries.length === 0) {
        setZipErrors(["Geen lettertypebestanden (WOFF2/WOFF/TTF/OTF) gevonden in dit zip-bestand."]);
        return;
      }

      let done = 0;
      const errors: string[] = [];
      for (const entry of entries) {
        const filename = entry.name.split("/").pop() ?? entry.name;
        setZipStatus(`Bezig met ${filename}... (${done + 1}/${entries.length})`);
        try {
          const blob = await entry.async("blob");
          const ext = filename.split(".").pop()!.toLowerCase();
          const fontFile = new File([blob], filename, { type: `font/${ext}` });
          // Familie, gewicht en stijl komen uit het bestand zelf; de
          // bestandsnaam levert alleen een CSS-familienaam voor oude templates.
          const meta = parseFontFilename(filename);
          await uploadOne(fontFile, { name: "", family: meta.family });
          done++;
        } catch (err) {
          errors.push(`${filename}: ${err instanceof Error ? err.message : "onbekende fout"}`);
        }
      }

      setZipStatus(`${done} van ${entries.length} lettertypen toegevoegd.`);
      setZipErrors(errors);
      await load();
    } catch {
      setZipErrors(["Kon het zip-bestand niet lezen. Is het een geldig .zip-bestand?"]);
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Lettertypen</h1>
        <p className="mt-1 text-muted-foreground">
          Upload de huisstijl-fonts (WOFF2, WOFF, TTF of OTF) die templates mogen gebruiken. Familie, gewicht, stijl
          en PostScript-naam worden uit het bestand zelf gelezen. Upload elk gewicht als eigen bestand; een
          tekstlaag wordt bij het activeren van een templateversie aan precies één bestand gekoppeld.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={upload} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="fontname">Weergavenaam (optioneel)</Label>
              <Input
                id="fontname"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!familyTouched) setFamily(e.target.value);
                }}
                placeholder="FF DIN Black"
              />
            </div>
            <div>
              <Label htmlFor="fontfamily">CSS-familienaam (optioneel)</Label>
              <Input
                id="fontfamily"
                value={family}
                onChange={(e) => {
                  setFamily(e.target.value);
                  setFamilyTouched(true);
                }}
                placeholder="FF DIN"
              />
            </div>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              {file ? file.name : "Bestand kiezen"}
              <input type="file" accept=".woff2,.woff,.ttf,.otf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <Button type="submit" disabled={loading || !file} className="sm:col-span-3 sm:w-fit">
              {loading ? "Bezig..." : "Uploaden"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <div>
            <p className="font-medium">Meerdere gewichten in één keer (.zip)</p>
            <p className="text-sm text-muted-foreground">
              Heb je een zip-bestand met meerdere lettertypebestanden van dezelfde familie (bv. Regular, Bold en
              Black)? Naam, CSS-familienaam, gewicht en stijl worden automatisch uit elke bestandsnaam afgeleid — dus
              geen los formulier per gewicht nodig.
            </p>
          </div>
          <label className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
            {zipBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
            Zip-bestand kiezen
            <input
              type="file"
              accept=".zip"
              className="hidden"
              disabled={zipBusy}
              onChange={(e) => {
                const zipFile = e.target.files?.[0];
                e.target.value = "";
                if (zipFile) uploadZip(zipFile);
              }}
            />
          </label>
          {zipStatus && <p className="text-sm text-muted-foreground">{zipStatus}</p>}
          {zipErrors.length > 0 && (
            <ul className="text-sm text-destructive">
              {zipErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fonts.map((f) => (
          <Card key={f.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-2xl leading-tight" style={{ fontFamily: previewFamily(f.id) }}>
                  Aa Bb Cc
                </p>
                <p className="mt-1 text-sm font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">
                  {f.fileFamily ?? f.family} {f.subfamily ?? ""} · {f.weight} · {f.style === "italic" ? "cursief" : "normaal"} ·{" "}
                  {f.format.toUpperCase()}
                </p>
                {f.postscriptName && <p className="text-xs text-muted-foreground">PostScript: {f.postscriptName}</p>}
                {!f.metadataReadAt && (
                  <button className="text-xs text-hhc-orange-dark hover:underline" onClick={() => patchFont(f.id, { refreshMetadata: true })}>
                    Gegevens uit bestand inlezen
                  </button>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <button onClick={() => patchFont(f.id, { isActive: !f.isActive })} title={f.isActive ? "Uitzetten" : "Aanzetten"}>
                  <Badge variant={f.isActive ? "success" : "outline"}>{f.isActive ? "Actief" : "Uit"}</Badge>
                </button>
                <Button size="sm" variant="ghost" onClick={() => remove(f.id)}>
                  Verwijderen
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {fonts.length === 0 && <p className="text-sm text-muted-foreground">Nog geen lettertypen geüpload.</p>}
      </div>
    </div>
  );
}
