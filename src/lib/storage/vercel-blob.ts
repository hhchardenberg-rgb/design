import { put, del, head } from "@vercel/blob";
import type { PutFileInput, StorageDriver } from "./index";

/**
 * Vercel Blob-driver. Bestanden komen op een écht persistente, publieke
 * CDN-URL terecht (in tegenstelling tot de lokale driver, die op Vercel's
 * serverless functions niet betrouwbaar blijft bestaan tussen aanroepen).
 *
 * Vercel Blob ondersteunt twee auth-methodes:
 *  1. Klassiek: een los `BLOB_READ_WRITE_TOKEN`.
 *  2. OIDC: `BLOB_STORE_ID` + het door Vercel automatisch meegegeven
 *     `VERCEL_OIDC_TOKEN`. Belangrijk: zodra `BLOB_STORE_ID` in de
 *     omgeving staat, negeert de SDK een eventuele `BLOB_READ_WRITE_TOKEN`
 *     volledig en probeert hij altijd OIDC — dat werkt alléén als de store
 *     ook echt via het dashboard (project → Storage-tab → store verbinden)
 *     aan dít project gekoppeld is. Een `BLOB_STORE_ID` die je handmatig
 *     hebt overgetypt (bv. vanaf de eigen ".env.local"-tab van de store)
 *     geeft dus geen toegang — dat resulteert in "This store does not
 *     exist.", ook al bestaat de store wél.
 *
 * We geven `storeId` hier expliciet mee (in plaats van alleen op de
 * env-var te vertrouwen) zodat dit consistent gedrag oplevert, en loggen
 * bij een fout welke auth-variabelen aanwezig zijn (zonder de waarden zelf
 * te loggen) zodat dit in de Vercel Runtime Logs te herleiden is.
 */
function authOptions() {
  const storeId = process.env.BLOB_STORE_ID;
  return storeId ? { storeId } : {};
}

function logAuthDiagnostics(action: string, error: unknown) {
  console.error(`[vercel-blob] ${action} mislukt:`, error, {
    heeftBlobStoreId: Boolean(process.env.BLOB_STORE_ID),
    heeftReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    heeftOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN),
  });
}

export function vercelBlobStorage(): StorageDriver {
  return {
    async put({ key, data, contentType }: PutFileInput) {
      try {
        const blob = await put(key, data, {
          access: "public",
          contentType,
          addRandomSuffix: false,
          allowOverwrite: true,
          ...authOptions(),
        });
        return { url: blob.url, key };
      } catch (error) {
        logAuthDiagnostics("put", error);
        throw error;
      }
    },
    async get(key: string) {
      const info = await head(key, authOptions());
      const res = await fetch(info.url);
      if (!res.ok) throw new Error(`Kon blob niet ophalen: ${key} (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(key: string) {
      await del(key, authOptions()).catch(() => {
        // Best-effort: als de blob al weg is, is er niets te doen.
      });
    },
    urlFor(key: string) {
      // Niet gebruikt in de praktijk: put() geeft de echte CDN-URL al terug,
      // en get()/delete() werken op basis van de key via head()/del().
      throw new Error(`urlFor() wordt niet ondersteund door de Vercel Blob-driver (key: ${key})`);
    },
  };
}
