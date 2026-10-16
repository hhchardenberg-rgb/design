import { readFile } from "fs/promises";
import path from "path";
import { getStorage } from "@/lib/storage";

/**
 * Laadt een asset (achtergrond, upload, lettertype) als Buffer, ongeacht of
 * de URL via de lokale storage-driver ("/api/files/..."), de statische
 * "public/"-map (bv. het meegeleverde voorbeeldtemplate), of extern (S3/R2
 * publieke bucket-URL / absolute http(s)-URL) wijst.
 *
 * Beveiliging: deze functie wordt ook aangeroepen met een URL die
 * rechtstreeks (ongesaneerd) uit een request body komt (zie het
 * `psdUrl`-veld in /api/admin/templates/upload). Zonder de controles
 * hieronder zou een "/"-URL met "../"-segmenten bestanden buiten de
 * "public/"-map kunnen lezen (path traversal / LFI), en zou een externe
 * URL de server willekeurige outbound requests laten doen (SSRF). Alleen
 * paden die daadwerkelijk binnen "public/" blijven, en alleen hosts die
 * horen bij deze apps eigen storage (Vercel Blob / het geconfigureerde
 * S3-publieke basis-adres) zijn toegestaan.
 */
export async function loadAssetBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("/api/files/")) {
    const key = decodeURIComponent(url.slice("/api/files/".length));
    return getStorage().get(key);
  }
  if (url.startsWith("/")) {
    const publicRoot = path.join(process.cwd(), "public");
    const resolved = path.resolve(publicRoot, "." + decodeURIComponent(url));
    if (resolved !== publicRoot && !resolved.startsWith(publicRoot + path.sep)) {
      throw new Error(`Ongeldig assetpad: ${url}`);
    }
    return readFile(resolved);
  }
  assertAllowedExternalHost(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kon asset niet laden: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Staat alleen externe fetches toe naar hosts die bij deze apps eigen,
 * geconfigureerde opslag horen (Vercel Blob's publieke CDN-domein, of het
 * expliciet ingestelde S3_PUBLIC_BASE_URL) — nooit een willekeurige,
 * door de aanroeper opgegeven host (SSRF-preventie).
 */
export function assertAllowedExternalHost(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Ongeldige asset-URL: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Ongeldig URL-schema voor asset: ${url}`);
  }

  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".public.blob.vercel-storage.com")) return;

  const s3PublicBase = process.env.S3_PUBLIC_BASE_URL;
  if (s3PublicBase) {
    try {
      if (new URL(s3PublicBase).hostname.toLowerCase() === host) return;
    } catch {
      // Ongeldige S3_PUBLIC_BASE_URL-configuratie — telt niet mee als match.
    }
  }

  throw new Error(`Asset-host niet toegestaan: ${host}`);
}
