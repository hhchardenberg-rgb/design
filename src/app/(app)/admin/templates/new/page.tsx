"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

// Veilige marge onder Vercel's harde limiet van 4,5MB per functie-request-body.
const VERCEL_FUNCTION_BODY_LIMIT = 4 * 1024 * 1024;

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
      const meta = { name, category, templateId };

      let blobUrl: string | null = null;
      let blobFailure: string | null = null;
      try {
        blobUrl = await tryUploadToBlob(file);
      } catch (err) {
        blobFailure = err instanceof Error ? err.message : String(err);
        console.error("Directe upload naar Vercel Blob mislukt, val terug op de gewone upload:", err);
      }

      let data: UploadResult;
      if (blobUrl) {
        data = await finishImport({ psdUrl: blobUrl }, meta);
      } else if (file.size < VERCEL_FUNCTION_BODY_LIMIT) {
        // Alleen de gewone (multipart) upload proberen als het bestand
        // onder Vercel's harde limiet voor een functie-request-body past —
        // anders levert dit gegarandeerd een onbegrijpelijke
        // "FUNCTION_PAYLOAD_TOO_LARGE"-pagina van het platform zelf op,
        // vóórdat onze eigen code ooit draait.
        data = await uploadDirectly(file, meta).catch((directErr: unknown) => {
          const directMessage = directErr instanceof Error ? directErr.message : String(directErr);
          throw new Error(
            blobFailure ? `Blob-upload: ${blobFailure} — Fallback: ${directMessage}` : directMessage
          );
        });
      } else {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        throw new Error(
          `Upload rechtstreeks naar Vercel Blob is mislukt (${blobFailure ?? "onbekende fout"}). ` +
            `Het bestand is ${sizeMb}MB, ruim boven de 4,5MB die een gewone upload op Vercel aankan, ` +
            `dus een gewone upload is hier niet mogelijk als terugvaloptie. Controleer of de Blob store ` +
            `correct aan dit project gekoppeld is (Storage-tab in het Vercel-dashboard, zie README) en probeer opnieuw.`
        );
      }

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

interface UploadMeta {
  name: string;
  category: string;
  templateId: string | null;
}

interface UploadResult {
  template: { id: string };
  version: { id: string };
  warnings?: { message: string }[];
}

/**
 * Uploadt het PSD-bestand rechtstreeks vanuit de browser naar Vercel Blob
 * (buiten onze serverless function om — die heeft een harde limiet van
 * 4,5MB op het request-body, ruim onder wat een PSD-bestand vaak weegt).
 * Gooit een fout wanneer dit niet lukt (geen Blob store gekoppeld, een
 * content-type/CORS-probleem, etc.); de aanroeper vangt dit op en valt
 * terug op uploadDirectly(), met de oorspronkelijke foutmelding bewaard
 * zodat die zichtbaar blijft als de fallback ook faalt.
 */
async function tryUploadToBlob(file: File): Promise<string> {
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/admin/templates/upload/blob-auth",
    contentType: "application/octet-stream",
    // PSD-bestanden zijn vaak groot (embedded rasterlagen); multipart
    // splitst dit op in delen die parallel geüpload worden.
    multipart: true,
  });
  return blob.url;
}

/** Rondt de import af op basis van een al-geüploade PSD-URL (Vercel Blob). */
async function finishImport(source: { psdUrl: string }, meta: UploadMeta): Promise<UploadResult> {
  const res = await fetch("/api/admin/templates/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...source, ...meta }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload mislukt");
  return data;
}

/** Fallback: stuurt het bestand als multipart/form-data direct naar onze eigen route. */
async function uploadDirectly(file: File, meta: UploadMeta): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  if (meta.templateId) form.append("templateId", meta.templateId);
  form.append("name", meta.name);
  form.append("category", meta.category);
  const res = await fetch("/api/admin/templates/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload mislukt");
  return data;
}
