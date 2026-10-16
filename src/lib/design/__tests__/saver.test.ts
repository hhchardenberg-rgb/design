// Gedrag van autosave: volgorde, conflicten, fouten en flush vóór export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DesignSaver } from "../saver";

interface Call {
  url: string;
  body: Record<string, unknown>;
  resolve: (status: number, data: unknown) => void;
}

function harness(initialDesign: { id: string; revision: number } | null = null) {
  const calls: Call[] = [];
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let nextId = 1;
  const saver = new DesignSaver({
    templateVersionId: "tv1",
    matchId: null,
    title: "Matchday",
    initialDesign,
    debounceMs: 800,
    retryDelays: [2000],
    fetchFn: ((url: string, init: RequestInit) =>
      new Promise<Response>((res) => {
        calls.push({
          url,
          body: JSON.parse(String(init.body)),
          resolve: (status, data) => res(new Response(JSON.stringify(data), { status })),
        });
      })) as unknown as typeof fetch,
    timers: {
      set: (fn, ms) => {
        const id = nextId++;
        timers.push({ fn, ms, id });
        return id;
      },
      clear: (h) => {
        const i = timers.findIndex((t) => t.id === h);
        if (i >= 0) timers.splice(i, 1);
      },
    },
  });
  const tick = async () => {
    const t = timers.shift();
    t?.fn();
    await new Promise((r) => setImmediate(r));
  };
  const settle = () => new Promise((r) => setImmediate(r));
  return { saver, calls, timers, tick, settle };
}

test("autosave: geen concept zonder wijziging, daarna één aanmaakverzoek", async () => {
  const h = harness();
  assert.equal(h.saver.getSnapshot().state, "idle");
  assert.equal(h.timers.length, 0);
  h.saver.change({ a: "1" });
  h.saver.change({ a: "12" });
  assert.equal(h.timers.length, 1, "doortypen wordt gedebounced");
  await h.tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, "/api/designs");
  assert.deepEqual(h.calls[0].body.formData, { a: "12" });
  h.calls[0].resolve(200, { design: { id: "d1", revision: 1 } });
  await h.settle();
  assert.equal(h.saver.getSnapshot().state, "saved");
  assert.equal(h.saver.getSnapshot().designId, "d1");
});

test("autosave: wijziging tijdens opslaan gaat daarna mee, op de nieuwe revisie", async () => {
  const h = harness({ id: "d1", revision: 4 });
  h.saver.change({ a: "1" });
  await h.tick();
  assert.equal(h.calls[0].body.baseRevision, 4);
  h.saver.change({ a: "2" }); // terwijl verzoek 1 loopt
  assert.equal(h.calls.length, 1, "nooit twee verzoeken tegelijk");
  h.calls[0].resolve(200, { design: { id: "d1", revision: 5 } });
  await h.settle();
  assert.equal(h.saver.getSnapshot().state, "pending");
  await h.tick();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].body.baseRevision, 5);
  assert.deepEqual(h.calls[1].body.formData, { a: "2" });
  h.calls[1].resolve(200, { design: { id: "d1", revision: 6 } });
  await h.settle();
  assert.equal(h.saver.getSnapshot().state, "saved");
  assert.equal(h.saver.getSnapshot().revision, 6);
});

test("autosave: conflict blokkeert, gebruiker kiest", async () => {
  const h = harness({ id: "d1", revision: 2 });
  h.saver.change({ a: "mijn" });
  await h.tick();
  h.calls[0].resolve(409, { error: "gewijzigd", conflict: { revision: 7, formData: { a: "andere" } } });
  await h.settle();
  assert.equal(h.saver.getSnapshot().state, "conflict");
  h.saver.change({ a: "mijn2" });
  assert.equal(h.timers.length, 0, "geen automatische overschrijving bij conflict");
  assert.equal(await h.saver.flush(), false, "export wacht niet op een onopgelost conflict");

  h.saver.keepMine();
  await h.tick();
  assert.equal(h.calls[1].body.baseRevision, 7);
  assert.deepEqual(h.calls[1].body.formData, { a: "mijn2" });
});

test("autosave: andere versie laden zet de serverstaat terug", async () => {
  const h = harness({ id: "d1", revision: 2 });
  h.saver.change({ a: "mijn" });
  await h.tick();
  h.calls[0].resolve(409, { conflict: { revision: 3, formData: { a: "andere" } } });
  await h.settle();
  assert.deepEqual(h.saver.takeTheirs(), { a: "andere" });
  assert.equal(h.saver.getSnapshot().state, "saved");
  assert.equal(h.saver.getSnapshot().revision, 3);
});

test("autosave: tijdelijke fout behoudt invoer en probeert opnieuw", async () => {
  const h = harness({ id: "d1", revision: 1 });
  h.saver.change({ a: "x" });
  await h.tick();
  h.calls[0].resolve(503, { error: "even niet" });
  await h.settle();
  assert.equal(h.saver.getSnapshot().state, "error");
  assert.equal(h.timers[0].ms, 2000);
  await h.tick();
  assert.deepEqual(h.calls[1].body.formData, { a: "x" });
  h.calls[1].resolve(200, { design: { id: "d1", revision: 2 } });
  await h.settle();
  assert.equal(h.saver.getSnapshot().state, "saved");
});

test("flush vóór export wacht op de actuele invoer", async () => {
  const h = harness({ id: "d1", revision: 1 });
  h.saver.change({ a: "x" });
  const done = h.saver.flush();
  await h.settle();
  assert.equal(h.calls.length, 1, "flush slaat de debounce over");
  h.calls[0].resolve(200, { design: { id: "d1", revision: 2 } });
  assert.equal(await done, true);
  assert.equal(h.saver.getSnapshot().revision, 2);
  assert.equal(await h.saver.flush(), true, "niets te doen: direct klaar");
});

test("ongeldige invoer: geen herhaling tot een nieuwe wijziging", async () => {
  const h = harness({ id: "d1", revision: 1 });
  h.saver.change({ a: "x" });
  await h.tick();
  h.calls[0].resolve(400, { error: "Opponent: maximaal 20 tekens." });
  await h.settle();
  assert.equal(h.saver.getSnapshot().state, "invalid");
  assert.equal(h.timers.length, 0);
  h.saver.change({ a: "y" });
  assert.equal(h.timers.length, 1);
});
