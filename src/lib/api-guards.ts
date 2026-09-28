import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasRole, type AppRole } from "@/lib/roles";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new ApiError(401, "Niet ingelogd.");
  return session.user;
}

/** Vereist dat de ingelogde gebruiker een specifieke rol heeft (bv. TICKETING). */
export async function requireRole(role: AppRole) {
  const user = await requireUser();
  if (!hasRole(user.roles, role)) throw new ApiError(403, `Je hebt de rol '${role}' nodig voor deze actie.`);
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!hasRole(user.roles, "ADMIN")) throw new ApiError(403, "Alleen voor beheerders.");
  return user;
}

/**
 * Voor het beheren van Ticketing-content (/admin/ticketing en de
 * bijbehorende API's): vereist zowel ADMIN als TICKETING, zodat een
 * beheerder zonder de Ticketing-rol geen Ticketing-inhoud kan bekijken of
 * wijzigen via het beheergedeelte.
 */
export async function requireTicketingAdmin() {
  const user = await requireAdmin();
  if (!hasRole(user.roles, "TICKETING")) throw new ApiError(403, "Alleen voor beheerders met de rol Ticketing.");
  return user;
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  // P2003: foreign-key constraint failed — meestal een verwijderpoging op een
  // rij waar nog andere gegevens naar verwijzen (bv. een tegenstander met nog
  // gekoppelde wedstrijden, of een template met nog gegenereerde ontwerpen).
  // Geef een begrijpelijke melding in plaats van de generieke 500 hieronder.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return NextResponse.json(
      {
        error:
          "Dit kan niet verwijderd worden omdat er nog andere gegevens naar verwijzen (bijv. gekoppelde wedstrijden, ontwerpen of teams). Verwijder die eerst.",
      },
      { status: 409 }
    );
  }
  console.error(error);
  return NextResponse.json({ error: "Er is iets misgegaan." }, { status: 500 });
}
