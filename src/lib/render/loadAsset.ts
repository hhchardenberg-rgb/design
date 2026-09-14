import { readFile } from "fs/promises";
import path from "path";
import { getStorage } from "@/lib/storage";

/**
 * Laadt een asset (achtergrond, upload, lettertype) als Buffer, ongeacht of
 * de URL via de lokale storage-driver ("/api/files/..."), de statische
 * "public/"-map (bv. het meegeleverde voorbeeldtemplate), of extern (S3/R2
 * publieke bucket-URL / absolute http(s)-URL) wijst.
 */
export async function loadAssetBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("/api/files/")) {
    const key = decodeURIComponent(url.slice("/api/files/".length));
    return getStorage().get(key);
  }
  if (url.startsWith("/")) {
    return readFile(path.join(process.cwd(), "public", decodeURIComponent(url)));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kon asset niet laden: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
