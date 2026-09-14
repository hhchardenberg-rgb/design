import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

/**
 * Serveert bestanden uit de lokale storage-driver (alleen relevant wanneer
 * STORAGE_DRIVER=local). In productie met S3/R2 wijst urlFor() rechtstreeks
 * naar de bucket en komt deze route niet in het spel.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const key = segments.join("/");
  try {
    const storage = getStorage();
    const buffer = await storage.get(key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentTypeFor(key),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Bestand niet gevonden" }, { status: 404 });
  }
}

function contentTypeFor(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "psd":
      return "application/octet-stream";
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}
