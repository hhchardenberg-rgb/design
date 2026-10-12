import { z } from "zod";
import { COMPANY_STATUSES } from "./companies.server";

// Gedeelde invoerschema's voor de commerciële API-routes (Next staat geen extra exports uit route-bestanden toe).
const text = z.string().trim().max(500).nullish();
export const companySchema = z.object({
  name: z.string().trim().min(1, "Geef het bedrijf een naam.").max(200),
  tradeName: text,
  status: z.enum(COMPANY_STATUSES).optional(),
  street: text,
  postalCode: text,
  city: text,
  country: text,
  website: text,
  email: text,
  phone: text,
  kvkNumber: text,
  vatNumber: text,
  billingName: text,
  billingEmail: text,
  billingAddress: text,
  industry: text,
  tags: z.array(z.string().trim().max(60)).max(30).optional(),
  sponsorCategory: text,
  source: text,
  internalNotes: z.string().max(5000).nullish(),
  ownerId: z.string().nullish(),
  teamId: z.string().nullish(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Geef de contactpersoon een naam.").max(200),
  jobTitle: z.string().trim().max(200).nullish(),
  email: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(60).nullish(),
  role: z.string().trim().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Geef de taak een titel.").max(200),
  description: z.string().trim().max(2000).nullish(),
  assigneeId: z.string().nullish(),
  dueAt: z.coerce.date().nullish(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  companyId: z.string().nullish(),
});
