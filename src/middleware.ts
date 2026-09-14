import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Gebruikt bewust de lichte, edge-safe config (geen Prisma/bcrypt) zodat
// de Edge Function-bundel binnen Vercel's grootte-limiet blijft. De
// volledige config met de Credentials-provider zit in src/lib/auth.ts en
// draait alleen server-side (API-route, server components).
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");
  const isProtectedRoute = isAdminRoute || pathname.startsWith("/dashboard") ||
    pathname.startsWith("/templates") || pathname.startsWith("/designs");

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

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/templates/:path*", "/designs/:path*"],
};
