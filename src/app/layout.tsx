import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WearWise — Know what to wear today",
  description: "Daily outfit ideas from the clothes you already own.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "WearWise", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#FBF7F0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <div className="mx-auto min-h-dvh max-w-[480px] bg-background">{children}</div>
      </body>
    </html>
  );
}
