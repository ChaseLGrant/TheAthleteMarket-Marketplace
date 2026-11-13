import type { Metadata } from "next";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4"><Logo /></div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}
