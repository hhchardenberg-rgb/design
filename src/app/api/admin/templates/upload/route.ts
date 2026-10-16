import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { getStorage, buildKey } from "@/lib/storage";
import { assertAllowedExternalHost } from "@/lib/render/loadAsset";
import { requireHubAdmin, apiErrorResponse, ApiError } from "@/lib/api-guards";
import { createImportJob, runImportJob } from "@/lib/psd/import-job.server";
import { importJobResponse } from "@/lib/psd/import-job-response";

async function assertLoadable(url: string) {
  if (url.startsWith("/api/files/")) return;
  if (url.startsWith("/")) throw new ApiError(400, "Ongeldige PSD-URL.");
  try {
    assertAllowedExternalHost(url);
  } catch {
    throw new ApiError(400, "Deze PSD-URL is niet toegestaan.");
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FORM_UPLOAD_BYTES = 50 * 1024 * 1024;

interface UploadInput {
  sourceUrl: string;
  name: string;
  category: string;
  templateId: string | null;
  deferred: boolean;
}

/**
 * Admin-flow stap 1: PSD uploaden -> automatisch parsen -> Template +
 * (concept) TemplateVersion aanmaken met gedetecteerde velden.
 * De admin komt hierna in de template-builder terecht om de gedetecteerde
 * velden te controleren en te verfijnen (zie /admin/templates/[id]/builder).
 *
 * Twee manieren om het bestand aan te leveren:
 *  - multipart/form-data met een "file" (kleine bestanden / lokale dev)
 *  - JSON met een "psdUrl" die al rechtstreeks (client-side) naar Vercel
 *    Blob is geüpload — nodig omdat PSD's vaak groter zijn dan de 4,5MB
 *    request-bodylimiet van een Vercel serverless function (zie
 *    /api/admin/templates/upload/blob-auth).
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireHubAdmin();
    const input = await parseInput(req);
    const { deferred, ...jobInput } = input;
    const job = await createImportJob({ ...jobInput, userId: admin.id });
    // Met deferred geeft dit meteen de taak terug en voert de client hem uit
    // via GET /api/admin/templates/import-jobs/<id> (die een afgebroken
    // poging ook opnieuw oppakt). Anders direct uitvoeren.
    if (deferred) return importJobResponse(job);
    return importJobResponse(await runImportJob(job.id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function parseInput(req: NextRequest): Promise<UploadInput> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json();
    const psdUrl = String(body.psdUrl ?? "");
    const name = String(body.name ?? "").trim();
    const category = String(body.category ?? "Overig").trim();
    const templateId = body.templateId ? String(body.templateId) : null;

    if (!psdUrl) throw new ApiError(400, "Geen PSD-URL ontvangen.");
    if (!name && !templateId) throw new ApiError(400, "Geef een naam voor de template op.");

    // Alleen eigen opslag (zie assertAllowedExternalHost in loadAsset).
    await assertLoadable(psdUrl);
    return { sourceUrl: psdUrl, name, category, templateId, deferred: body.deferred === true };
  }

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "Overig").trim();
  const templateId = form.get("templateId") ? String(form.get("templateId")) : null;

  if (!(file instanceof File)) {
    throw new ApiError(400, "Geen PSD-bestand ontvangen.");
  }
  // Op Vercel wordt dit al afgedwongen door de 4,5MB-bodylimiet van de
  // functie (zie de bestandskop hierboven); deze check is defense-in-depth
  // voor andere hostingomgevingen, waar die platformlimiet er niet is.
  if (file.size > MAX_FORM_UPLOAD_BYTES) {
    throw new ApiError(400, `Bestand is te groot voor directe upload (max ${Math.round(MAX_FORM_UPLOAD_BYTES / (1024 * 1024))}MB) — gebruik de Blob-upload voor grotere PSD's.`);
  }
  if (!file.name.toLowerCase().endsWith(".psd")) {
    throw new ApiError(400, "Upload een .psd-bestand.");
  }
  if (!name && !templateId) {
    throw new ApiError(400, "Geef een naam voor de template op.");
  }

  const stored = await getStorage().put({
    key: buildKey("templates", "bron", `${nanoid(10)}.psd`),
    data: Buffer.from(await file.arrayBuffer()),
    contentType: "application/octet-stream",
  });
  return { sourceUrl: stored.url, name, category, templateId, deferred: form.get("deferred") === "true" };
}
