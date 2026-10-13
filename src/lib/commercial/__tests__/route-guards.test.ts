// Bewaking: elke commerciële API-route moet via het centrale omhulsel (handle) of requireCommercial lopen,
// zodat vlag, sessie en lidmaatschap nooit per ongeluk worden overgeslagen. Draait zonder database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routes(p) : name === "route.ts" ? [p] : [];
  });
}

test("alle commerciële API-routes zijn afgeschermd", () => {
  const files = routes(join(process.cwd(), "src/app/api/commercial"));
  assert.ok(files.length > 30);
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.ok(/\bhandle\(|requireCommercial\(/.test(src), `${f} mist de centrale toegangscontrole`);
  }
});

test("publieke routes zijn bewust beperkt en beveiligd", () => {
  const cron = readFileSync(join(process.cwd(), "src/app/api/cron/commercial-reminders/route.ts"), "utf8");
  assert.ok(cron.includes("CRON_SECRET") && cron.includes("timingSafeEqual"));
  const hook = readFileSync(join(process.cwd(), "src/app/api/webhooks/resend/route.ts"), "utf8");
  assert.ok(hook.includes("RESEND_WEBHOOK_SECRET") && hook.includes("verifyWebhookSignature"));
  const unsub = readFileSync(join(process.cwd(), "src/app/api/mail/unsubscribe/route.ts"), "utf8");
  assert.ok(unsub.includes("readUnsubscribeParams") && !unsub.includes("export async function GET"));
});
