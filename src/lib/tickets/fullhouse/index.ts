import { createMockProvider } from "./mock-provider";
import { createVivenuProvider } from "./vivenu-provider";
import type { FullhouseMode, TicketProvider } from "./types";

/**
 * Welke Fullhouse-provider actief is. Zonder volledige configuratie altijd de testprovider,
 * nooit stilletjes productie. Een preview gebruikt nooit de productie-API.
 * De echte vivenu-provider (alleen lezen) staat in vivenu-provider.ts.
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

/** Echte provider alleen bij modus sandbox/production én een ingestelde API-sleutel (heeft voorrang) of scanapparaat-token; anders de testprovider. */
export function ticketProvider(): TicketProvider {
  if (provider) return provider;
  const c = fullhouseConfigured();
  const token = process.env.FULLHOUSE_ACCESS_TOKEN;
  const apiKey = process.env.FULLHOUSE_API_KEY;
  provider =
    c.mode !== "mock" && (apiKey || token)
      ? createVivenuProvider({ mode: c.mode, baseUrl: c.baseUrl, apiKey: apiKey || undefined, accessToken: apiKey ? undefined : token, allowWrites: process.env.FULLHOUSE_ALLOW_WRITES === "true" })
      : createMockProvider();
  return provider;
}

/** Alleen voor tests. */
export function resetTicketProvider() {
  provider = null;
}
