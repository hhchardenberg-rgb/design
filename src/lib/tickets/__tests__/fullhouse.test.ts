import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createVivenuProvider, mapTicket } from "../fullhouse/vivenu-provider";
import { verifyFullhouseSignature } from "../fullhouse/webhook";
import { FullhouseError } from "../fullhouse/types";

const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

test("webhookhandtekening: juist, fout, ontbrekend en met andere body", () => {
  const body = '{"type":"ticket.updated"}';
  assert.equal(verifyFullhouseSignature("geheim", body, sign("geheim", body)), true);
  assert.equal(verifyFullhouseSignature("geheim", body, sign("anders", body)), false);
  assert.equal(verifyFullhouseSignature("geheim", body + " ", sign("geheim", body)), false);
  assert.equal(verifyFullhouseSignature("geheim", body, null), false);
  assert.equal(verifyFullhouseSignature("geheim", body, "xyz"), false);
});

test("mapTicket faalt veilig bij ontbrekende verplichte velden", () => {
  assert.throws(() => mapTicket({ _id: "1", barcode: "B" }, "e1"), (e: unknown) => e instanceof FullhouseError && e.kind === "bad_response");
  assert.throws(() => mapTicket("tekst", "e1"), FullhouseError);
  const t = mapTicket({ _id: "1", barcode: "B", status: "VALID", name: "Jan Jansen" }, "e1");
  assert.deepEqual([t.externalId, t.barcode, t.status, t.eventId], ["1", "B", "VALID", "e1"]);
});

function provider(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, allowWrites = false) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { p: createVivenuProvider({ mode: "sandbox", baseUrl: "https://vivenu.dev/api", accessToken: "tok", allowWrites, fetchImpl }), calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("vivenu-provider: leest met token-header, pagineert en zet 404 om naar null", async () => {
  const { p, calls } = provider((url) => (url.includes("/tickets/v2/") ? json({ docs: [{ _id: "1", barcode: "B1", status: "VALID" }], total: 1 }) : json(null, 404)));
  const page = await p.fetchTicketsPage("ev 1", { top: 5000, skip: 0 });
  assert.equal(page.total, 1);
  assert.match(calls[0].url, /\/accessusers\/tickets\/v2\/ev%201\?top=1000&skip=0$/);
  assert.equal(calls[0].headers.token, "tok");
  assert.equal(await p.lookupBarcode("ONBEKEND", "ev"), null);
});

test("vivenu-provider: foutafhandeling per statuscode", async () => {
  const kind = async (status: number) => {
    const { p } = provider(() => json({}, status));
    try {
      await p.listEvents();
      return "ok";
    } catch (e) {
      return e instanceof FullhouseError ? e.kind : "anders";
    }
  };
  assert.equal(await kind(401), "auth");
  assert.equal(await kind(429), "rate_limited");
  assert.equal(await kind(500), "network");
});

test("vivenu-provider: schrijfacties staan standaard uit", async () => {
  const { p, calls } = provider(() => json({}));
  await assert.rejects(p.scanBarcode("B"), /Schrijven naar Fullhouse staat uit/);
  await assert.rejects(p.pushOfflineScans("e", []), /Schrijven naar Fullhouse staat uit/);
  assert.equal(calls.length, 0, "er is geen enkel verzoek gedaan");
});
