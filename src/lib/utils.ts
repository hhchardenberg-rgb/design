import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// E-mailadres is de gebruikersnaam voor inloggen; normaliseer altijd voor
// opslag én lookup zodat inloggen niet hoofdlettergevoelig is (Postgres'
// @unique-index op User.email is dat standaard wel).
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
