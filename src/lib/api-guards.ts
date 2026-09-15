import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";

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

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Alleen voor beheerders.");
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
