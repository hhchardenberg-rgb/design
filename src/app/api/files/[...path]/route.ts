import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { requireUser } from "@/lib/api-guards";
import { hasRole } from "@/lib/roles";

/**
 * Serveert bestanden uit de lokale storage-driver (alleen relevant wanneer
 * STORAGE_DRIVER=local). In productie met S3/R2 wijst urlFor() rechtstreeks
 * naar de bucket en komt deze route niet in het spel.
 *
 * Vereist een ingelogde gebruiker: de hele hub zit achter een loginmuur (zie
 * middleware.ts), dus een onbeveiligde bestandsroute zou die bescherming
 * omzeilen voor iedereen die een bestands-URL weet of deelt.
 *
 * De meeste prefixes (templates/, fonts/, opponents/, contacts/, news/,
 * stock-photos/) zijn bewust voor elke ingelogde hub-gebruiker zichtbaar —
 * dat is precies waar ze voor bedoeld zijn (sjablonen/lettertypen worden
 * voor alle gebruikers gerenderd, contactfoto's/nieuwsafbeeldingen/
 * fotobank zijn gedeelde content). Twee prefixes horen dat niet te zijn en
 * krijgen daarom een expliciete extra check: "ticketing-excel/" (alleen
 * voor de rol TICKETING) en "uploads/"/"exports/" (alleen de eigenaar, aan
 * de hand van het {userId}-segment in de key, of een beheerder).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { path: segments } = await params;
  const key = segments.join("/");

  const isAdmin = hasRole(user.roles, "ADMIN");
  if (segments[0] === "ticketing-excel" && !isAdmin && !hasRole(user.roles, "TICKETING")) {
    return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  }
  if ((segments[0] === "uploads" || segments[0] === "exports") && !isAdmin && segments[1] !== user.id) {
    return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  }

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
