import { z } from "zod";
import { TICKET_CATEGORY_KEYS, VALIDITY_MODES } from "./rules";

// Invoercontrole voor alle HHC Tickets-API's (server-side; de client mag niets afdwingen).

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gebruik een geldige datum.");
const optDay = day.nullish().or(z.literal("")).transform((v) => (v ? v : null));
const instant = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Gebruik een geldige datum en tijd.");
const optInstant = instant.nullish().or(z.literal("")).transform((v) => (v ? v : null));

export const seasonSchema = z
  .object({ name: text(60).min(1, "Geef het seizoen een naam."), startsOn: day, endsOn: day })
  .refine((s) => s.endsOn > s.startsOn, { message: "Het einde moet na het begin liggen.", path: ["endsOn"] });

export const zoneSchema = z.object({
  name: text(60).min(1, "Geef het vak een naam."),
  description: optText(200),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const eventSchema = z
  .object({
    title: text(120).min(1, "Geef de wedstrijd een titel."),
    opponent: optText(80),
    competition: optText(60),
    isHome: z.boolean().default(true),
    location: optText(120),
    startsAt: instant,
    endsAt: optInstant,
    seasonId: optText(40),
    status: z.enum(["DRAFT", "ACTIVE", "CLOSED", "CANCELLED"]).default("DRAFT"),
    allowReentry: z.boolean().default(false),
    capacity: z.number().int().min(1).max(100_000).nullish(),
    matchId: optText(40),
  })
  .refine((e) => !e.endsAt || new Date(e.endsAt) > new Date(e.startsAt), { message: "Het einde moet na de aftrap liggen.", path: ["endsAt"] });

export const typeSchema = z.object({
  name: text(80).min(1, "Geef het tickettype een naam."),
  description: optText(300),
  category: z.enum(TICKET_CATEGORY_KEYS as [string, ...string[]]),
  validityMode: z.enum(Object.keys(VALIDITY_MODES) as [string, ...string[]]),
  isSeasonCard: z.boolean().default(false),
  seasonId: optText(40),
  competitions: z.array(text(60).min(1)).max(20).default([]),
  homeOnly: z.boolean().default(true),
  validFrom: optDay,
  validUntil: optDay,
  zoneId: optText(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  active: z.boolean().default(true),
});

export const holderSchema = z.object({
  firstName: text(60).min(1, "Vul een voornaam in."),
  lastName: text(80).min(1, "Vul een achternaam in."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email("Vul een geldig e-mailadres in.")
    .nullish()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  phone: optText(30),
  company: optText(120),
  relation: optText(120),
  note: optText(500),
});
export type HolderInput = z.infer<typeof holderSchema>;

/** Uitgifte: één of meer houders met dezelfde ticketinstellingen. */
export const issueSchema = z.object({
  typeId: z.string().min(1, "Kies een tickettype."),
  zoneId: optText(40),
  eventIds: z.array(z.string().min(1)).max(100).default([]),
  seasonId: optText(40),
  validFrom: optDay,
  validUntil: optDay,
  holders: z.array(holderSchema).min(1, "Voeg minstens één tickethouder toe.").max(2000, "Maximaal 2000 tickets per keer."),
  batchName: optText(120),
});
export type IssueInput = z.infer<typeof issueSchema>;

export const statusChangeSchema = z.object({
  status: z.enum(["ACTIVE", "BLOCKED", "CANCELLED"]),
  reason: text(500).min(3, "Geef een reden op (minstens 3 tekens)."),
});

export const reissueSchema = z.object({
  what: z.enum(["qr", "link"]),
  reason: text(500).min(3, "Geef een reden op (minstens 3 tekens)."),
});

export const batchReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: optText(500),
});

export const settingsSchema = z.object({
  bulkApprovalThreshold: z.number().int().min(1).max(100_000),
  retentionPersonalMonths: z.number().int().min(1).max(240),
  retentionScanMonths: z.number().int().min(1).max(240),
  retentionTechnicalDays: z.number().int().min(7).max(3650),
});
