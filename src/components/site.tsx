import Link from "next/link";
import { paymentsOff } from "@/lib/env";
import { DISCLAIMER } from "@/lib/constants";
import { Logo } from "./ui";

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://theathletemarket.com";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="Coach Line by The Athlete Market — home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium text-navy">
          <Link href="/#pricing" className="hidden rounded-lg px-3 py-2 hover:bg-surface sm:block">Pricing</Link>
          <Link href="/#how" className="hidden rounded-lg px-3 py-2 hover:bg-surface md:block">How it works</Link>
          <Link href="/join" className="hidden rounded-lg px-3 py-2 hover:bg-surface md:block">For coaches</Link>
          <Link href="/ask" className="btn-primary btn-sm whitespace-nowrap">Ask a college</Link>
          <a href={MAIN} className="hidden rounded-lg px-3 py-2 text-muted hover:bg-surface lg:block">theathletemarket.com ↗</a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-navy text-white">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo light />
          <p className="max-w-md text-sm leading-relaxed text-white/60">{DISCLAIMER}</p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-white">Families</p>
          <Link className="block text-white/60 hover:text-white" href="/ask">Message a college</Link>
          {!paymentsOff() && <Link className="block text-white/60 hover:text-white" href="/coaches">Film evaluations</Link>}
          <Link className="block text-white/60 hover:text-white" href="/#faq">FAQ</Link>
          <a className="block text-white/60 hover:text-white" href={MAIN}>The Athlete Market</a>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-white">Company</p>
          <Link className="block text-white/60 hover:text-white" href="/join">For coaches</Link>
          <Link className="block text-white/60 hover:text-white" href="/legal/terms">Terms</Link>
          <Link className="block text-white/60 hover:text-white" href="/legal/privacy">Privacy</Link>
          <Link className="block text-white/60 hover:text-white" href="/legal/evaluator-policy">Evaluator eligibility policy</Link>
        </div>
      </div>
      <div className="container-page border-t border-white/10 py-5 text-xs text-white/45">
        © {new Date().getFullYear()} The Athlete Market. Payments processed securely by Stripe.
      </div>
    </footer>
  );
}
