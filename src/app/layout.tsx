import type { Metadata, Viewport } from "next";
import "./globals.css";
import { isDemoMode } from "@/lib/env";
import Link from "next/link";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://marketplace.theathletemarket.com";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "College Coach Video Evaluations | The Athlete Market", template: "%s | The Athlete Market" },
  description:
    "Get a personal 30–60 second video evaluation of your highlight film from a verified college-level coach. You're only charged when your video is delivered. No accounts, no app.",
  applicationName: "The Athlete Market Evaluations",
  openGraph: {
    type: "website",
    siteName: "The Athlete Market",
    title: "Honest feedback on your film from a college-level coach",
    description: "Personal 30–60 second video evaluations. Charged only when delivered.",
    url: site,
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { themeColor: "#0B1B3F", width: "device-width", initialScale: 1 };

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
