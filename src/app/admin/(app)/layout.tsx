import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Logo } from "@/components/ui";
import { logout } from "../actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "Overview"], ["/admin/requests", "Requests"], ["/admin/coaches", "Coaches"],
  ["/admin/finance", "Money"], ["/admin/emails", "Emails"], ["/admin/settings", "Settings"], ["/admin/launch", "🚀 Launch"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 overflow-x-auto px-4 py-3">
          <Link href="/admin" className="shrink-0"><Logo /></Link>
          <nav className="flex gap-1 text-sm font-medium">
            {NAV.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-1.5 hover:bg-surface">{label}</Link>)}
          </nav>
          <form action={logout} className="ml-auto shrink-0"><button className="text-sm text-muted hover:text-navy">Sign out</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
