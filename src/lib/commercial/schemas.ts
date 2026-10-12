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

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gebruik een datum in de vorm JJJJ-MM-DD.");
export const seasonSchema = z.object({ name: z.string().trim().min(1).max(60), startsOn: day, endsOn: day, status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).optional() });
export const packageSchema = z.object({
  name: z.string().trim().min(1, "Geef het pakket een naam.").max(120),
  description: z.string().trim().max(2000).nullish(),
  defaultAmountCents: z.number().int().min(0).nullable().optional(),
  items: z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).nullish(), quantity: z.number().int().min(1).max(999).optional() })).max(50).optional(),
});
export const contractSchema = z.object({
  seasonId: z.string().min(1, "Kies een seizoen."),
  packageId: z.string().nullish(),
  startsOn: day,
  endsOn: day,
  amountCents: z.number().int().min(0).nullable().optional(),
  renewalOn: day.nullish(),
  noticeUntil: day.nullish(),
  autoRenew: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullish(),
});
export const contractUpdateSchema = contractSchema.partial().extend({ version: z.number().int() });
export const counterpartSchema = z.object({ title: z.string().trim().min(1, "Geef de tegenprestatie een titel.").max(200), description: z.string().trim().max(1000).nullish(), quantity: z.number().int().min(1).max(999).optional(), dueOn: day.nullish() });
export const counterpartUpdateSchema = z.object({ status: z.enum(["PLANNED", "IN_PROGRESS", "DELIVERED", "CANCELLED"]).optional(), dueOn: day.nullish(), notes: z.string().trim().max(2000).nullish(), description: z.string().trim().max(1000).nullish() });
