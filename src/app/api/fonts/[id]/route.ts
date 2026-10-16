import { prisma } from "@/lib/prisma";
import { loadAssetBuffer } from "@/lib/render/loadAsset";

const CONTENT_TYPES: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

/**
 * Lettertypebestanden via de eigen domeinnaam. De Content-Security-Policy
 * staat alleen fonts van 'self' toe; de bestanden zelf staan in Blob-opslag.
 * Met ?v=<sha256> mag de browser het bestand onbeperkt bewaren.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const font = await prisma.font.findUnique({ where: { id }, select: { fileUrl: true, format: true, sha256: true } });
  if (!font) return new Response("Niet gevonden", { status: 404 });
  const buffer = await loadAssetBuffer(font.fileUrl);
  const versioned = new URL(req.url).searchParams.get("v");
  const immutable = versioned && font.sha256 && versioned === font.sha256;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[font.format] ?? "application/octet-stream",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
}
