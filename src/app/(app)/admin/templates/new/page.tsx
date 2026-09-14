"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const CATEGORIES = [
  "Wedstrijd",
  "Opstelling",
  "Uitslag",
  "Speler",
  "Sociaal",
  "Nieuws",
  "Evenementen",
  "Jeugd",
  "Vrouwenvoetbal",
  "Overig",
];

export default function NewTemplatePage() {
  return (
    <Suspense>
      <NewTemplateForm />
    </Suspense>
  );
}

function NewTemplateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("templateId");
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Kies een PSD-bestand.");
    if (!templateId && !name) return setError("Geef een naam voor de template op.");
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (templateId) form.append("templateId", templateId);
      form.append("name", name);
      form.append("category", category);
      const res = await fetch("/api/admin/templates/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload mislukt");
      setWarnings((data.warnings ?? []).map((w: { message: string }) => w.message));
      router.push(`/admin/templates/${data.template.id}/builder?versionId=${data.version.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{templateId ? "Nieuwe versie uploaden" : "Nieuwe template uploaden"}</h1>
        <p className="mt-1 text-muted-foreground">
          Upload een .psd-bestand met de naamgevingsconventie (TEXT:/IMAGE:/COLOR:/VISIBILITY:). Bekijk de{" "}
          <a href="/docs/psd-conventions" className="text-hhc-orange-dark hover:underline">
            documentatie voor designers
          </a>
          .
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!templateId && (
              <>
                <div>
                  <Label htmlFor="name">Naam van de template</Label>
                  <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Matchday" />
                </div>
                <div>
                  <Label htmlFor="category">Categorie</Label>
                  <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label htmlFor="psd">PSD-bestand</Label>
              <div className="flex items-center justify-center rounded-md border-2 border-dashed border-border bg-surface-muted p-6 text-sm text-muted-foreground">
                <label className="flex cursor-pointer flex-col items-center gap-2">
                  <Upload className="h-5 w-5" />
                  {file ? file.name : "Kies een .psd-bestand"}
                  <input
                    id="psd"
                    type="file"
                    accept=".psd"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Bezig met importeren..." : "Importeren"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {warnings.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
