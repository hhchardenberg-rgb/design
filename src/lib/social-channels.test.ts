import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSocialUrl, sortSocialChannels } from "./social-channels";

test("normalizeSocialUrl maakt nette https-links", () => {
  assert.equal(normalizeSocialUrl("www.facebook.com/hhc"), "https://www.facebook.com/hhc");
  assert.equal(normalizeSocialUrl(" http://instagram.com/hhc "), "https://instagram.com/hhc");
  assert.equal(normalizeSocialUrl("https://x.com/hhc"), "https://x.com/hhc");
});

test("normalizeSocialUrl weigert ongeldige links", () => {
  assert.equal(normalizeSocialUrl(""), null);
  assert.equal(normalizeSocialUrl("javascript:alert(1)"), null);
  assert.equal(normalizeSocialUrl("mailto:info@hhc.nl"), null);
  assert.equal(normalizeSocialUrl("hhc"), null);
});

test("sortSocialChannels houdt de vaste volgorde aan", () => {
  const sorted = sortSocialChannels([
    { platform: "youtube", url: "https://youtube.com/a" },
    { platform: "facebook", url: "https://facebook.com/a" },
  ]);
  assert.deepEqual(sorted.map((c) => c.platform), ["facebook", "youtube"]);
});
