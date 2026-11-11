import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HHC Scanner",
    short_name: "HHC Scanner",
    start_url: "/scan",
    scope: "/scan",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#f26a21",
    icons: [{ src: "/icon.png", sizes: "any", type: "image/png" }],
  };
}
