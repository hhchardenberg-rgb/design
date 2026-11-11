import { createMockProvider } from "./mock-provider";
import type { FullhouseMode, TicketProvider } from "./types";

/**
 * Welke Fullhouse-provider actief is. Zonder volledige configuratie altijd de testprovider,
 * nooit stilletjes productie. Een preview gebruikt nooit de productie-API.
 * De echte vivenu-provider wordt in fase 3/4 aangesloten (zie architectuur §2).
 */
export function fullhouseMode(): FullhouseMode {
  const m = process.env.FULLHOUSE_MODE;
  if (m === "production" && process.env.VERCEL_ENV === "preview") return "mock";
  return m === "production" || m === "sandbox" ? m : "mock";
}

export function fullhouseConfigured(): { mode: FullhouseMode; apiKey: boolean; accessToken: boolean; webhookSecret: boolean; baseUrl: string } {
  const mode = fullhouseMode();
  return {
    mode,
    apiKey: !!process.env.FULLHOUSE_API_KEY,
    accessToken: !!process.env.FULLHOUSE_ACCESS_TOKEN,
    webhookSecret: !!process.env.FULLHOUSE_WEBHOOK_SECRET,
    baseUrl: process.env.FULLHOUSE_API_BASE || (mode === "sandbox" ? "https://vivenu.dev/api" : "https://vivenu.com/api"),
  };
}

let provider: TicketProvider | null = null;

export function ticketProvider(): TicketProvider {
  if (provider) return provider;
  // Fase 1: alleen de testprovider. De vivenu-provider volgt met de scanner.
  provider = createMockProvider();
  return provider;
}
