import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Gebruikt bewust de lichte, edge-safe config (geen Prisma/bcrypt) zodat
// de Edge Function-bundel binnen Vercel's grootte-limiet blijft. De
// volledige config met de Credentials-provider zit in src/lib/auth.ts en
// draait alleen server-side (API-route, server components).
const { auth } = NextAuth(authConfig);

// Alle onderdelen van de hub (buiten /admin) vereisen een ingelogde
// gebruiker — nieuwe onderdelen hier én in de matcher hieronder toevoegen.
const PROTECTED_PREFIXES = [
  "/hub",
  "/dashboard",
  "/templates",
  "/designs",
  "/huisstijl",
  "/docs",
  "/kalender",
  "/fotobank",
  "/nieuws",
  "/kennisbank",
  "/crisis",
  "/stopwatch",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");
  const isProtectedRoute = isAdminRoute || PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtectedRoute) return NextResponse.next();

  const user = req.auth?.user;
  if (!user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

// Next.js parseert `matcher` statisch tijdens de build — dit moet dus een
// letterlijke array zijn (geen `.map()` over PROTECTED_PREFIXES). Hou deze
// lijst in sync met PROTECTED_PREFIXES hierboven.
export const config = {
  matcher: [
    "/admin/:path*",
    "/hub/:path*",
    "/dashboard/:path*",
    "/templates/:path*",
    "/designs/:path*",
    "/huisstijl/:path*",
    "/docs/:path*",
    "/kalender/:path*",
    "/fotobank/:path*",
    "/nieuws/:path*",
    "/kennisbank/:path*",
    "/crisis/:path*",
    "/stopwatch/:path*",
  ],
};
