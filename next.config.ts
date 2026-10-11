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
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "ag-psd"],
  // Voorkomt dat Next.js automatisch AGENTS.md/CLAUDE.md-bestanden genereert.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
