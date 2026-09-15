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
}

export default function AdminFontsPage() {
  const [fonts, setFonts] = useState<Font[]>([]);
  const [name, setName] = useState("");
  const [family, setFamily] = useState("");
  const [familyTouched, setFamilyTouched] = useState(false);
  const [weight, setWeight] = useState("400");
  const [style, setStyle] = useState("normal");
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
          const face = new FontFace(previewFamily(f.id), `url(${f.fileUrl})`);
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
    if (!file || !name) return;
    setLoading(true);
    try {
      await uploadOne(file, { name, family: family || name, weight: Number(weight), style });
      setName("");
      setFile(null);
      await load();
    } catch {
      // stil falen is hier acceptabel: het los-per-veld formulier had al geen foutmelding
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/fonts/${id}`, { method: "DELETE" });
    await load();
  }

  async function uploadOne(fontFile: File, meta: { name: string; family: string; weight: number; style: string }) {
    const form = new FormData();
    form.append("file", fontFile);
    form.append("name", meta.name);
    form.append("family", meta.family);
    form.append("weight", String(meta.weight));
    form.append("style", meta.style);
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
          const meta = parseFontFilename(filename);
          await uploadOne(fontFile, meta);
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
          Upload de huisstijl-fonts (WOFF2, WOFF, TTF of OTF) die templates mogen gebruiken. Heeft een lettertype
          meerdere gewichten (Regular, Bold, Black, ...)? Upload elk gewicht apart, maar gebruik steeds dezelfde{" "}
          <strong>CSS-familienaam</strong> — dan kan een template met één <code>fontFamily</code> automatisch het
          juiste gewicht/stijl kiezen.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={upload} className="grid gap-3 sm:grid-cols-[1fr_1fr_120px_120px_auto] sm:items-end">
            <div>
              <Label htmlFor="fontname">Weergavenaam</Label>
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
              <Label htmlFor="fontfamily">CSS-familienaam</Label>
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
            <div>
              <Label>Gewicht</Label>
              <Select value={weight} onChange={(e) => setWeight(e.target.value)}>
                {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Stijl</Label>
              <Select value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="normal">Normaal</option>
                <option value="italic">Cursief</option>
              </Select>
            </div>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              {file ? file.name : "Bestand kiezen"}
              <input type="file" accept=".woff2,.woff,.ttf,.otf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <Button type="submit" disabled={loading} className="sm:col-span-5 sm:w-fit">
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
                  {f.weight} · {f.style} · {f.format.toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={f.isActive ? "success" : "outline"}>{f.isActive ? "Actief" : "Uit"}</Badge>
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
