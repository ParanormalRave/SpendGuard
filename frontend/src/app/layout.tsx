import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Inter, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

// Fonts from docs/design.md section 5. The variables are consumed by the
// Tailwind theme in globals.css (--font-display, --font-sans, --font-mono).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

// Landing hero fonts per spec — loaded alongside the existing app fonts.
// The landing page uses these variables explicitly so dashboard/activity
// typography is not affected and backend wiring stays intact.
const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsLanding = JetBrains_Mono({
  variable: "--font-jetbrains-landing",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const interLanding = Inter({
  variable: "--font-inter-landing",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SpendGuard",
  description: "Give your AI agent a wallet it can't abuse. Devnet only.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${instrument.variable} ${jetbrains.variable} ${schibsted.variable} ${jetbrainsLanding.variable} ${interLanding.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
