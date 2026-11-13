import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isTicketsEnabled } from "@/lib/tickets/flag";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "HHC Scanner",
  manifest: "/scan/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "HHC Scanner", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#f26a21", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  if (!isTicketsEnabled()) notFound();
  return <div className="min-h-dvh bg-neutral-950 text-white">{children}</div>;
}
