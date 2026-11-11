import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    {
      name: "HHC Scanner",
      short_name: "HHC Scanner",
      start_url: "/scan",
      scope: "/scan",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0a0a0a",
      theme_color: "#f26a21",
      icons: [{ src: "/icon.png", sizes: "any", type: "image/png" }],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
