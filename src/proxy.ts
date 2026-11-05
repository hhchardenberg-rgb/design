import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { hasRole, isSectionAdmin, resolveHomePath, type AppRole } from "@/lib/roles";
import { allowedDuringMfaSetup, MFA_SETUP_PATH } from "@/lib/auth-policy";

// Apparaatcookie voor de melding "nieuwe inlog" (src/lib/login-alerts.server.ts): een willekeurige
// waarde, verder niets. Wordt gezet op de loginpagina en op elke beveiligde pagina.
const DEVICE_COOKIE = "hhc_device";
function withDeviceCookie(req: Parameters<Parameters<typeof auth>[0]>[0], res: NextResponse): NextResponse {
  if (!req.cookies.get(DEVICE_COOKIE)) {
    res.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 2 * 365 * 24 * 60 * 60,
    });
  }
  return res;
}

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
// toegang"-pagina voor gebruikers zonder enige rol, en
// accountbeveiliging — élke gebruiker moet zijn eigen MFA kunnen
// beheren, ongeacht welke sectierol hij verder heeft).
const LOGIN_ONLY_PREFIXES = ["/geen-toegang", "/account", "/commercieel"];

export default auth((req) => withDeviceCookie(req, guard(req)));

/**
 * Beheer (pagina's en API) alleen vanuit deze landen; Vercel geeft het land van de bezoeker mee
 * in x-vercel-ip-country. Aanpasbaar met ADMIN_ALLOWED_COUNTRIES (bv. "NL,BE,DE,ES" tijdens een
 * vakantie); "*" zet de beperking uit. Zonder landinformatie (lokaal) is er geen beperking.
 */
function adminCountryBlocked(req: Parameters<Parameters<typeof auth>[0]>[0]): boolean {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) return false;
  const allowed = (process.env.ADMIN_ALLOWED_COUNTRIES ?? "NL,BE,DE").toUpperCase().split(",").map((c) => c.trim()).filter(Boolean);
  if (allowed.includes("*")) return false;
  const country = req.headers.get("x-vercel-ip-country")?.toUpperCase();
  return !!country && !allowed.includes(country);
}

function guard(req: Parameters<Parameters<typeof auth>[0]>[0]): NextResponse {
  const { pathname } = req.nextUrl;
  if (adminCountryBlocked(req)) {
    return new NextResponse("Het beheer van de Hub is alleen bereikbaar vanuit Nederland, België en Duitsland.", { status: 403 });
  }
  if (pathname.startsWith("/api/")) return NextResponse.next();
  const isAdminRoute = pathname.startsWith("/admin");
  // Eén beheer, drie onderdelen: Ticketing-content (/admin/ticketing) is voor de
  // ticketingbeheerder, de overige inhoud voor de communicatiebeheerder, en de
  // hoofdadmin mag overal. Het overzicht (/admin) en gebruikersbeheer (/admin/users)
  // staan ook open voor beheerders van Commerciële Zaken, wier rechten uit de
  // database komen; die controle gebeurt server-side op de pagina en in de API.
  const isTicketingAdminRoute = pathname.startsWith("/admin/ticketing");
  // De centrale nieuwsmodule (/admin/nieuws) is voor beheerders van elk onderdeel; de pagina en
  // de API bepalen per onderdeel wat iemand mag.
  const isSharedAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/users") || pathname.startsWith("/admin/nieuws");
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

  // Verplichte tweestapsverificatie nog niet ingesteld: eerst dat, de rest van de Hub is dicht.
  if (user.mfaSetupRequired && !allowedDuringMfaSetup(pathname)) {
    const url = new URL(MFA_SETUP_PATH, req.nextUrl.origin);
    url.searchParams.set("verplicht", "1");
    return NextResponse.redirect(url);
  }

  const roles = (user.roles ?? []) as AppRole[];
  const has = (role: AppRole) => hasRole(roles, role);
  const deny = () => NextResponse.redirect(new URL(resolveHomePath(roles), req.nextUrl.origin));

  if (isAdminRoute && !isSharedAdminRoute) {
    const allowed = isTicketingAdminRoute ? isSectionAdmin(roles, "ticketing") : isSectionAdmin(roles, "hub");
    if (!allowed) return deny();
  }
  if (isHubRoute && !has("HUB")) return deny();
  if (isTicketingRoute && !has("TICKETING")) return deny();

  return NextResponse.next();
}

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
    "/account/:path*",
    "/commercieel/:path*",
    // Alleen voor de apparaatcookie; de pagina zelf is openbaar.
    "/login",
    // Alleen voor de landbeperking van het beheer; de API controleert zelf de rechten.
    "/api/admin/:path*",
  ],
};
