import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deze packages bevatten native (.node) bindings en moeten niet door de
  // bundler worden verwerkt, maar op runtime als gewone Node-module worden
  // geladen (PSD-import, lettertype-rendering en beeldbewerking).
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "ag-psd"],
  // Voorkomt dat Next.js automatisch AGENTS.md/CLAUDE.md-bestanden genereert.
  agentRules: false,
};

export default nextConfig;
