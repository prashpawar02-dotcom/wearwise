import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";

// Typefaces are driven entirely by the --font-sans / --font-serif / --font-mono
// CSS variables defined in globals.css (safe system font stacks, no network fetch).
// TODO: Reintroduce Inter / Instrument Serif (or Geist) via next/font once the
// build environment has registry/network access; until then the system stacks apply.

export const metadata: Metadata = {
  title: "WearWise — Know what to wear today",
  description:
    "WearWise turns your wardrobe, weather, and plans into one confident outfit recommendation — using clothes you already own.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "WearWise", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F5F1EA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
