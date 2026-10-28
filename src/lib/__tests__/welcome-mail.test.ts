import { test } from "node:test";
import assert from "node:assert/strict";
import { renderWelcomeMail } from "@/lib/welcome-mail-render";

const mail = renderWelcomeMail({
  name: "Piet <Test>",
  email: "piet@example.com",
  setPasswordUrl: "https://hub.hhc-hardenberg.nl/wachtwoord-resetten/abc123",
  linkValidUntil: "04/11/2026",
  hubUrl: "https://hub.hhc-hardenberg.nl",
});

test("welkomstmail bevat instellink, inlogadres en uitleg over tweestapsverificatie", () => {
  for (const part of [mail.html, mail.text]) {
    assert.ok(part.includes("https://hub.hhc-hardenberg.nl/wachtwoord-resetten/abc123"));
    assert.ok(part.includes("https://hub.hhc-hardenberg.nl"));
    assert.ok(part.includes("04/11/2026"));
    assert.ok(part.includes("authenticator-app"));
    assert.ok(part.includes("/account/security"));
  }
  assert.equal(mail.subject, "Welkom bij de HHC Hardenberg Hub");
});

test("welkomstmail escapet de naam in html", () => {
  assert.ok(mail.html.includes("Piet &lt;Test&gt;"));
  assert.ok(!mail.html.includes("Piet <Test>"));
});
