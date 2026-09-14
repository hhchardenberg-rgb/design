import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guards";

export const runtime = "nodejs";

/**
 * Geeft de browser een kortstondig token om een PSD-bestand rechtstreeks
 * naar Vercel Blob te uploaden, buiten onze serverless function om — die
 * heeft (net als alle Vercel-functies) een harde limiet van 4,5MB op het
 * request-body, wat voor PSD-bestanden al snel te weinig is.
 *
 * Als er geen Blob store gekoppeld is (geen BLOB_READ_WRITE_TOKEN) faalt
 * dit endpoint; de client valt dan terug op de directe upload-route
 * (werkt alleen betrouwbaar voor kleinere bestanden / lokale development).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        await requireAdmin();
        return {
          allowedContentTypes: [
            "image/vnd.adobe.photoshop",
            "application/x-photoshop",
            "application/photoshop",
            "application/octet-stream",
          ],
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Niets te doen: de client roept na afloop zelf
        // /api/admin/templates/upload aan met de resulterende blob-URL.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Uploaden mislukt." },
      { status: 400 }
    );
  }
}
