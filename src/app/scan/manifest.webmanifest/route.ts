import { NextResponse } from "next/server";

// Oud adres van het scanner-manifest; het staat nu bij de andere apps (public/apps/scanner/).
// Telefoons met de eerdere scanner-app vinden hier zo de nieuwe versie (zelfde id "/scan").
export function GET(req: Request) {
  return NextResponse.redirect(new URL("/apps/scanner/manifest.webmanifest", req.url), 308);
}
