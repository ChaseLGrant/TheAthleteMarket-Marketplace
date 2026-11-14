import type { Metadata, Viewport } from "next";
import "./globals.css";
import { isDemoMode } from "@/lib/env";
import Link from "next/link";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://marketplace.theathletemarket.com";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "Coach Line — The Direct Line to College Coaches | The Athlete Market", template: "%s | The Athlete Market" },
  description:
    "Message any college coaching staff about camp dates, events and what level you fit. Get a real answer or pay nothing. No account, no app.",
  applicationName: "Coach Line by The Athlete Market",
  openGraph: {
    type: "website",
    siteName: "The Athlete Market",
    title: "Coach Line — the direct line to college coaches",
    description: "Camp dates, events, what level you fit — answered or it's free.",
    url: site,
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { themeColor: "#0A0D14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-navy focus:px-3 focus:py-2 focus:text-white">
          Skip to content
        </a>
        {demo && (
          <div className="bg-[#FFF5E6] px-4 py-2 text-center text-xs font-medium text-[#6b3d00]">
            Demo mode — simulated payments, email and storage. Nothing is charged.{" "}
            <Link className="underline" href="/demo/inbox">Open demo inbox</Link> ·{" "}
            <Link className="underline" href="/admin">Admin</Link>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
