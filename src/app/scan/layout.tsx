import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isTicketsEnabled } from "@/lib/tickets/flag";
import { pwaMetadata } from "@/lib/pwa-apps";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "HHC Scanner",
  robots: { index: false, follow: false },
  // Eigen app op het beginscherm: start direct op /scan, staand (zie src/lib/pwa-apps.ts).
  ...pwaMetadata("scanner"),
};
export const viewport: Viewport = { themeColor: "#0b0b0b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  if (!isTicketsEnabled()) notFound();
  return <div className="min-h-dvh bg-[#0b0b0b] text-white">{children}</div>;
}
