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
        // Browsers rapporteren voor .psd-bestanden zeer uiteenlopende (of
        // helemaal geen) content-types; niet beperken op contenttype om
        // dat geen bron van onnodige upload-fouten te laten zijn.
        return {
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
    // De @vercel/blob-clientbibliotheek toont de gebruiker altijd dezelfde
    // generieke tekst ("Failed to retrieve the client token"), ongeacht de
    // werkelijke oorzaak — log die daarom hier expliciet zodat hij in de
    // Vercel Runtime Logs te vinden is. Log ook (zonder de waarden zelf)
    // welke auth-variabelen aanwezig zijn: als BLOB_STORE_ID wél maar
    // BLOB_READ_WRITE_TOKEN niét aanwezig is, probeert de SDK altijd OIDC
    // — dat werkt alleen als de store via het dashboard (Storage-tab) ook
    // echt aan dit project gekoppeld is, niet als BLOB_STORE_ID handmatig
    // is overgetypt.
    console.error("[blob-auth] mislukt:", error, {
      heeftBlobStoreId: Boolean(process.env.BLOB_STORE_ID),
      heeftReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      heeftOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Uploaden mislukt." },
      { status: 400 }
    );
  }
}
