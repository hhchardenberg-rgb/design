"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

  async function load() {
    const res = await fetch("/api/admin/fonts");
    const data = await res.json();
    setFonts(data.fonts ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", name);
      form.append("family", family || name);
      form.append("weight", weight);
      form.append("style", style);
      const res = await fetch("/api/admin/fonts", { method: "POST", body: form });
      if (res.ok) {
        setName("");
        setFile(null);
        await load();
      }
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/fonts/${id}`, { method: "DELETE" });
    await load();
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fonts.map((f) => (
          <Card key={f.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-semibold" style={{ fontFamily: f.family }}>
                  {f.name}
                </p>
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
