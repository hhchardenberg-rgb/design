import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { NextResponse } from "next/server";
import { ApiError, requireHubAdmin } from "@/lib/api-guards";
import { MAX_PSD_UPLOAD_BYTES } from "@/lib/psd/upload-limits";

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
  const body = (await request.json()) as HandleUploadBody | HandleUploadPresignedBody;

  try {
    // Nieuwe route (uploadPresigned in de browser): werkt met de koppeling
    // die Vercel zelf beheert (BLOB_STORE_ID + OIDC) en heeft dus geen los
    // BLOB_READ_WRITE_TOKEN nodig. Dat losse token hoorde in productie bij
    // een oude, inmiddels verwijderde store, waardoor uploads mislukten met
    // "This store does not exist."
    if (body.type === "blob.generate-presigned-url" || (body.type === "blob.upload-completed" && process.env.BLOB_STORE_ID)) {
      const presigned = await handleUploadPresigned({
        body: body as HandleUploadPresignedBody,
        request,
        getSignedToken: async (pathname) => {
          await requireHubAdmin();
          if (!/^templates\/bron\/[A-Za-z0-9_-]+\.psd$/.test(pathname)) {
            throw new ApiError(400, "Ongeldige bestandsnaam voor de upload.");
          }
          const token = await issueSignedToken({
            pathname,
            operations: ["put"],
            maximumSizeInBytes: MAX_PSD_UPLOAD_BYTES,
            validUntil: Date.now() + 60 * 60 * 1000,
            ...(process.env.BLOB_STORE_ID ? { storeId: process.env.BLOB_STORE_ID } : {}),
          });
          return { token, urlOptions: { maximumSizeInBytes: MAX_PSD_UPLOAD_BYTES } };
        },
      });
      return NextResponse.json(presigned);
    }

    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async () => {
        await requireHubAdmin();
        // Browsers rapporteren voor .psd-bestanden zeer uiteenlopende (of
        // helemaal geen) content-types; niet beperken op contenttype om
        // dat geen bron van onnodige upload-fouten te laten zijn.
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_PSD_UPLOAD_BYTES,
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
    // requireHubAdmin() gooit een ApiError met een al veilige, voor de
    // gebruiker bedoelde melding (bv. "Alleen voor beheerders.") — die mag
    // gewoon terug. Alles anders (bv. een @vercel/blob-configuratiefout)
    // kan interne details bevatten (zie de log hieronder) en krijgt daarom
    // een generieke melding, conform hoe apiErrorResponse() dat elders in
    // de app doet.
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[blob-auth] mislukt:", error, {
      heeftBlobStoreId: Boolean(process.env.BLOB_STORE_ID),
      heeftReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      heeftOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN),
    });
    return NextResponse.json({ error: "Uploaden mislukt." }, { status: 400 });
  }
}
