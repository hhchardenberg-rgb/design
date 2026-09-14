/**
 * Storage-abstractie.
 *
 * De rest van de applicatie praat nooit rechtstreeks met de filesystem of
 * een S3-SDK; alles gaat via deze interface. Zo kan de storageprovider
 * later gewijzigd worden (lokale schijf tijdens development, S3 /
 * Cloudflare R2 / Supabase Storage in productie) door alleen de
 * `STORAGE_DRIVER` env var aan te passen.
 */
import { localStorage } from "./local";
import { s3Storage } from "./s3";

export interface PutFileInput {
  /** Pad/sleutel binnen de bucket, bv. "templates/abc123/background.png" */
  key: string;
  data: Buffer;
  contentType: string;
}

export interface StorageDriver {
  /** Slaat een bestand op en geeft de publiek bereikbare URL terug. */
  put(input: PutFileInput): Promise<{ url: string; key: string }>;
  /** Haalt een eerder opgeslagen bestand op. */
  get(key: string): Promise<Buffer>;
  /** Verwijdert een bestand (best-effort). */
  delete(key: string): Promise<void>;
  /** Publieke URL voor een gegeven key. */
  urlFor(key: string): string;
}

function loadDriver(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "s3") {
    return s3Storage();
  }
  return localStorage();
}

let cached: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!cached) cached = loadDriver();
  return cached;
}

export function buildKey(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}
