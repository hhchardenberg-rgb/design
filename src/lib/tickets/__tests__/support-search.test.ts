import assert from "node:assert/strict";
import { test } from "node:test";
import { detectKind, fullhouseSupportStatus, groupByCustomer, hhcPublicIdFrom, hhcSupportStatus, maskBarcode, maskEmail, maskTerm, validateTerm } from "../support-search";
import { createVivenuProvider } from "../fullhouse/vivenu-provider";
import { mockSearch } from "../fullhouse/mock-provider";
import { ticketPermissionIssues, TICKET_ROLE_TEMPLATES } from "../permissions";

test("zoeksoort raden", () => {
  assert.equal(detectKind("jan@voorbeeld.nl"), "email");
  assert.equal(detectKind("Jan Jansen"), "name");
  assert.equal(detectKind("Jansen"), "name");
  assert.equal(detectKind("65a1b2c3d4e5f6a7b8c9d0e1"), "order");
  assert.equal(detectKind("HHC1.0123456789ABCDEF.1.abcdefghijklmnopqrstuv"), "ticket");
  assert.equal(detectKind("0123456789abcdef"), "ticket");
  assert.equal(detectKind("FH-TEST-0003"), "ticket");
  assert.equal(detectKind("12345678"), "ticket");
  assert.equal(hhcPublicIdFrom("HHC1.0123456789ABCDEF.1.abc"), "0123456789ABCDEF");
});

test("minimale zoektermen", () => {
  assert.ok(validateTerm("email", "jan@"));
  assert.equal(validateTerm("email", "jan@voorbeeld.nl"), null);
  assert.ok(validateTerm("name", "j a"));
  assert.equal(validateTerm("name", "Jan"), null);
  assert.ok(validateTerm("ticket", "12"));
});

test("maskeren: e-mail, barcode en auditterm", () => {
  assert.equal(maskEmail("jan.jansen@gmail.com"), "j•••@gmail.com");
  assert.equal(maskEmail(null), null);
  assert.equal(maskBarcode("ABCDEF123456"), "••••3456");
  assert.equal(maskTerm("name", "Jan Jansen"), "J••• J•••");
  assert.equal(maskTerm("email", "Jan@Voorbeeld.nl"), "j•••@voorbeeld.nl");
  assert.equal(maskTerm("ticket", "FH-TEST-0003"), "••••0003");
});

test("status in gewone taal", () => {
  assert.equal(hhcSupportStatus({ status: "BLOCKED", expired: false, allEventsCancelled: true, scanned: true }), "REVOKED");
  assert.equal(hhcSupportStatus({ status: "ACTIVE", expired: false, allEventsCancelled: true, scanned: false }), "CANCELLED_EVENT");
  assert.equal(hhcSupportStatus({ status: "ACTIVE", expired: true, allEventsCancelled: false, scanned: true }), "EXPIRED");
  assert.equal(hhcSupportStatus({ status: "ACTIVE", expired: false, allEventsCancelled: false, scanned: true }), "SCANNED");
  assert.equal(hhcSupportStatus({ status: "ACTIVE", expired: false, allEventsCancelled: false, scanned: false }), "VALID");
  assert.equal(fullhouseSupportStatus({ status: "INVALID", eventCancelled: false, scanned: false }), "REVOKED");
  assert.equal(fullhouseSupportStatus({ status: "VALID", eventCancelled: true, scanned: false }), "CANCELLED_EVENT");
  assert.equal(fullhouseSupportStatus({ status: "VALID", eventCancelled: false, scanned: true }), "SCANNED");
  assert.equal(fullhouseSupportStatus({ status: "DETAILSREQUIRED", eventCancelled: false, scanned: false }), "DETAILS");
});

test("groeperen per klant: op e-mail (hoofdletterongevoelig), anders op naam", () => {
  const g = groupByCustomer([
    { email: "A@x.nl", name: "Anna" },
    { email: "a@x.nl", name: null },
    { email: null, name: "Bert" },
    { email: null, name: "bert" },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].tickets.length, 2);
  assert.equal(g[0].name, "Anna");
});

test("testprovider: zoeken op naam, e-mail, barcode en ordernummer", () => {
  assert.equal(mockSearch("email", "testbezoeker3@voorbeeld.nl").tickets.length, 1);
  assert.equal(mockSearch("ticket", "FH-TEST-0003").tickets[0].email, "testbezoeker3@voorbeeld.nl");
  assert.equal(mockSearch("order", "mock-order-2").tickets.length, 2);
  assert.ok(mockSearch("name", "testbezoeker 1").tickets.length >= 1);
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("vivenu-provider zoekt alleen met API-sleutel en alleen met GET", async () => {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.includes("/customers?")) return json({ docs: [{ _id: "c1" }], total: 1 });
    if (url.includes("/tickets?") && url.includes("customerId=c1")) return json({ rows: [{ _id: "t1", barcode: "B1", status: "VALID", firstname: "Jan", lastname: "Jansen", email: "jan@x.nl", transactionId: "tx1", eventId: "e1" }], total: 1 });
    return json({ docs: [] });
  }) as unknown as typeof fetch;
  const withKey = createVivenuProvider({ mode: "sandbox", baseUrl: "https://vivenu.dev/api", apiKey: "k", allowWrites: false, fetchImpl });
  const r = await withKey.searchHolders!("email", "jan@x.nl");
  assert.equal(r.tickets.length, 1);
  assert.equal(r.tickets[0].name, "Jan Jansen");
  assert.equal(r.tickets[0].transactionId, "tx1");
  assert.ok(calls.every((c) => c.method === "GET"));
  assert.match(calls[0].url, /\/customers\?email=jan%40x\.nl/);
  const tokenOnly = createVivenuProvider({ mode: "sandbox", baseUrl: "https://vivenu.dev/api", accessToken: "t", allowWrites: false, fetchImpl });
  assert.equal(tokenOnly.searchHolders, undefined);
});

test("vivenu-provider: onbekend ordernummer geeft niets", async () => {
  const fetchImpl = (async () => json({}, 404)) as unknown as typeof fetch;
  const p = createVivenuProvider({ mode: "sandbox", baseUrl: "https://vivenu.dev/api", apiKey: "k", allowWrites: false, fetchImpl });
  assert.deepEqual((await p.searchHolders!("order", "65a1b2c3d4e5f6a7b8c9d0e1")).tickets, []);
});

test("rol Klantenservicemedewerker is geldig", () => {
  const t = TICKET_ROLE_TEMPLATES.find((x) => x.key === "klantenservice")!;
  assert.deepEqual(ticketPermissionIssues(t.permissions), []);
  assert.ok(t.permissions.includes("support:search"));
});
