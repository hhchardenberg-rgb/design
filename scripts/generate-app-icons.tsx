/**
 * Maakt de iconen en manifesten van de Hub-apps (zie src/lib/pwa-apps.ts) in public/apps/<key>/.
 *
 *   npx tsx scripts/generate-app-icons.tsx
 *
 * Stijl: Dug-out. HHC-zwart vlak, wit lijnicoon, korte oranje lijn als signaal en "HHC" in FF DIN.
 * De scanner is omgekeerd (oranje vlak), zodat je hem bij de poort direct herkent tussen je apps.
 * Alles staat binnen de veilige zone van een maskable icoon (cirkel van 80%), dus het icoon
 * werkt ook als Android het rond of als druppel afsnijdt.
 * Vereist Playwright met Chromium (in de ontwikkelomgeving aanwezig).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Briefcase, Headset, Megaphone, ScanQrCode, Ticket, type LucideIcon } from "lucide-react";
import { PWA_APPS, PWA_THEME_COLOR, type PwaAppKey } from "../src/lib/pwa-apps";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright");

const ORANGE = "#ff6f00";
const BLACK = "#0b0b0b";
const ICONS: Record<PwaAppKey, LucideIcon> = {
  communicatie: Megaphone,
  commercieel: Briefcase,
  klantenservice: Headset,
  tickets: Ticket,
  scanner: ScanQrCode,
};

const root = path.resolve(__dirname, "..");
const din = readFileSync(path.join(root, "public/fonts/ff-din/FF_DIN_Bold.ttf")).toString("base64");

function html(key: PwaAppKey): string {
  const inverted = key === "scanner";
  const bg = inverted ? ORANGE : BLACK;
  const fg = inverted ? BLACK : "#ffffff";
  const accent = inverted ? BLACK : ORANGE;
  const label = inverted ? "rgba(11,11,11,0.62)" : "#8f8d87";
  const glyph = renderToStaticMarkup(createElement(ICONS[key], { size: 232, color: fg, strokeWidth: 1.75, absoluteStrokeWidth: false }));
  return `<!doctype html><html><head><style>
    @font-face { font-family: DIN; src: url(data:font/ttf;base64,${din}); }
    html, body { margin: 0; }
    .c { width: 512px; height: 512px; background: ${bg}; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .t { font: 700 46px/1 DIN; letter-spacing: 0.16em; color: ${label}; margin: 0 0 22px 0.16em; }
    .b { width: 76px; height: 11px; background: ${accent}; margin-top: 26px; }
  </style></head><body><div class="c"><div class="t">HHC</div>${glyph}<div class="b"></div></div></body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  for (const app of Object.values(PWA_APPS)) {
    const dir = path.join(root, "public/apps", app.key);
    mkdirSync(dir, { recursive: true });
    for (const size of [512, 192, 180]) {
      const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
      await page.setContent(html(app.key));
      await page.evaluate(() => document.fonts.ready);
      const file = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
      await page.screenshot({ path: path.join(dir, file), clip: { x: 0, y: 0, width: 512, height: 512 } });
      await page.close();
    }
    const b = `/apps/${app.key}`;
    const manifest = {
      id: app.id,
      name: app.name,
      short_name: app.shortName,
      description: app.description,
      lang: "nl",
      dir: "ltr",
      start_url: app.startUrl,
      scope: "/",
      display: "standalone",
      ...(app.orientation ? { orientation: app.orientation } : {}),
      background_color: app.dark ? BLACK : "#f5f5f3",
      theme_color: PWA_THEME_COLOR,
      icons: [
        { src: `${b}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `${b}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `${b}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: `${b}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    writeFileSync(path.join(dir, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`✓ ${app.key}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
