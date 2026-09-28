import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { resolveHomePath, type AppRole } from "@/lib/roles";

// Gebruikt bewust de lichte, edge-safe config (geen Prisma/bcrypt) zodat
// de Edge Function-bundel binnen Vercel's grootte-limiet blijft. De
// volledige config met de Credentials-provider zit in src/lib/auth.ts en
// draait alleen server-side (API-route, server components).
const { auth } = NextAuth(authConfig);

// De communicatie-hub — vereist de rol HUB. Nieuwe hub-onderdelen hier én in
// de matcher hieronder toevoegen.
const HUB_PREFIXES = [
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
  "/contactpersonen",
  "/persberichten",
];

// Het afgeschermde Ticketing-gedeelte — vereist de rol TICKETING.
const TICKETING_PREFIXES = ["/ticketing"];

// Vereist alleen ingelogd zijn, geen specifieke rol (bv. de "geen
// toegang"-pagina voor gebruikers zonder enige rol).
const LOGIN_ONLY_PREFIXES = ["/geen-toegang"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");
  // Ticketing-content beheren (/admin/ticketing) vereist behalve ADMIN ook
  // expliciet de rol TICKETING — anders zou een beheerder zonder die rol via
  // het beheergedeelte alsnog Ticketing-inhoud kunnen zien/bewerken.
  const isTicketingAdminRoute = pathname.startsWith("/admin/ticketing");
  const isHubRoute = HUB_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isTicketingRoute = TICKETING_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isLoginOnlyRoute = LOGIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isProtectedRoute = isAdminRoute || isHubRoute || isTicketingRoute || isLoginOnlyRoute;

  if (!isProtectedRoute) return NextResponse.next();

  const user = req.auth?.user;
  if (!user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const roles = (user.roles ?? []) as AppRole[];
  const has = (role: AppRole) => roles.includes(role);
  const deny = () => NextResponse.redirect(new URL(resolveHomePath(roles), req.nextUrl.origin));

  if (isAdminRoute && !has("ADMIN")) return deny();
  if (isTicketingAdminRoute && !has("TICKETING")) return deny();
  if (isHubRoute && !has("HUB")) return deny();
  if (isTicketingRoute && !has("TICKETING")) return deny();

  return NextResponse.next();
});

// Next.js parseert `matcher` statisch tijdens de build — dit moet dus een
// letterlijke array zijn (geen `.map()` over de prefix-lijsten hierboven).
// Hou deze lijst in sync met HUB_PREFIXES/TICKETING_PREFIXES/LOGIN_ONLY_PREFIXES.
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
    "/contactpersonen/:path*",
    "/persberichten/:path*",
    "/ticketing/:path*",
    "/geen-toegang/:path*",
  ],
};
