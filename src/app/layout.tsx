import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { BrandFontFaces } from "@/components/brand-fonts";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HHC Hardenberg Hub",
  description:
    "Dé plek voor vrijwilligers van Team Communicatie van HHC Hardenberg: clubafbeeldingen maken, huisstijl opzoeken en meer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${inter.variable} h-full antialiased`}>
      <head>
        <BrandFontFaces />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
