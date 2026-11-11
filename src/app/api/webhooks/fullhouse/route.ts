import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { verifyFullhouseSignature } from "@/lib/tickets/fullhouse/webhook";
import { syncEventTickets } from "@/lib/tickets/fullhouse/sync.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook van Fullhouse (vivenu): ticket.created/updated en transacties. Dicht zonder
 * FULLHOUSE_WEBHOOK_SECRET; de handtekening wordt over de ruwe body gecontroleerd. De inhoud
 * wordt niet vertrouwd: een gebeurtenis zet alleen een gerichte, alleen-lezen synchronisatie in
 * gang van het betreffende (bekende) evenement.
 */
export async function POST(req: Request) {
  if (!isTicketsEnabled()) return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  const secret = process.env.FULLHOUSE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook niet geconfigureerd." }, { status: 503 });
  const body = await req.text();
  if (!verifyFullhouseSignature(secret, body, req.headers.get("x-vivenu-signature"))) return NextResponse.json({ error: "Ongeldige handtekening." }, { status: 401 });
  let event: { type?: unknown; data?: { eventId?: unknown } | null; eventId?: unknown };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Ongeldige inhoud." }, { status: 400 });
  }
  const type = typeof event.type === "string" ? event.type.slice(0, 60) : "onbekend";
  const eventExtId = typeof event.data?.eventId === "string" ? event.data.eventId : typeof event.eventId === "string" ? event.eventId : null;
  const known = eventExtId ? await prisma.ticketEvent.findUnique({ where: { externalId: eventExtId }, select: { externalId: true } }) : null;
  await prisma.ticketSyncRun.create({ data: { kind: `webhook:${type}`, eventExtId: known?.externalId ?? null, status: "OK", mode: "webhook", finishedAt: new Date() } });
  if (known?.externalId) {
    try {
      await syncEventTickets({ id: null, name: "Webhook" }, known.externalId);
    } catch {
      // Gelogd in de synchronisatielijst; de volgende synchronisatie haalt het in.
    }
  }
  return NextResponse.json({ ok: true });
}
