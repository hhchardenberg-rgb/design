import type { NextConfig } from "next";

// Basisbeveiligingsheaders — hiervoor was er geen enkele CSP/clickjacking-
// /MIME-sniffing-bescherming geconfigureerd (niet hier, niet in een
// vercel.json, niet in middleware.ts). Bewust niet extreem restrictief: de
// designtool rendert canvas-content en laadt afbeeldingen van de
// geconfigureerde opslag (Vercel Blob / S3), dus 'self' alleen zou dat
// breken. `upgrade-insecure-requests` is veilig omdat de app alleen over
// https draait (Vercel).
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js' eigen hydration/inline runtime-scripts hebben 'unsafe-inline' nodig;
      // 'unsafe-eval' is niet toegevoegd.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // https: dekt zowel Vercel Blob- als S3-afbeeldingen, ongeacht welke
      // STORAGE_DRIVER actief is.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Deze packages bevatten native (.node) bindings en moeten niet door de
  // bundler worden verwerkt, maar op runtime als gewone Node-module worden
  // geladen (PSD-import, lettertype-rendering en beeldbewerking).
  // pdfjs-dist maakt voorbeelden van PDF- en AI-logo's in Commerciële Zaken.
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "ag-psd", "pdfjs-dist"],
  // Houdt de functiebundels op Vercel klein (Vercel telt de bundels van elke
  // bewaarde deployment mee als "Functions Storage"). Vercel draait op glibc-
  // Linux, dus de musl- en wasm-varianten van canvas/sharp worden nooit
  // geladen; Prisma gebruikt de native library-engine, niet de wasm-engines
  // voor andere databases. Samen scheelde dit ruim 100 MB per functie.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@napi-rs/canvas-linux-x64-musl/**",
      "node_modules/@img/sharp-libvips-linuxmusl-x64/**",
      "node_modules/@img/sharp-linuxmusl-x64/**",
      "node_modules/@img/sharp-wasm32/**",
      "node_modules/@prisma/client/runtime/*.wasm-base64.js",
      "node_modules/@prisma/client/runtime/*.wasm-base64.mjs",
    ],
  },
  // Voorkomt dat Next.js automatisch AGENTS.md/CLAUDE.md-bestanden genereert.
  agentRules: false,
  // Het rechtenbeheer van Commerciële Zaken is samengevoegd met het gebruikersbeheer.
  async redirects() {
    return [
      // Oud domein: pagina's sturen door naar hub.hhc-hardenberg.nl, zodat oude
      // links en bladwijzers blijven werken. /api/ blijft op beide adressen
      // bereikbaar, zodat cron en webhooks die nog het oude adres gebruiken niet
      // op een redirect stuklopen.
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "communicatie.hhc-hardenberg.nl" }],
        destination: "https://hub.hhc-hardenberg.nl/:path",
        permanent: true,
      },
      { source: "/admin/commercieel", destination: "/admin/users", permanent: true },
      { source: "/commercieel/instellingen/rechten", destination: "/admin/users", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
