import { put, del, head } from "@vercel/blob";
import type { PutFileInput, StorageDriver } from "./index";

/**
 * Vercel Blob-driver. Bestanden komen op een écht persistente, publieke
 * CDN-URL terecht (in tegenstelling tot de lokale driver, die op Vercel's
 * serverless functions niet betrouwbaar blijft bestaan tussen aanroepen).
 * Vereist dat er via het Vercel-dashboard (tab "Storage") een Blob store
 * aan het project is gekoppeld — dat zet `BLOB_READ_WRITE_TOKEN` vanzelf.
 */
export function vercelBlobStorage(): StorageDriver {
  return {
    async put({ key, data, contentType }: PutFileInput) {
      const blob = await put(key, data, {
        access: "public",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { url: blob.url, key };
    },
    async get(key: string) {
      const info = await head(key);
      const res = await fetch(info.url);
      if (!res.ok) throw new Error(`Kon blob niet ophalen: ${key} (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(key: string) {
      await del(key).catch(() => {
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
