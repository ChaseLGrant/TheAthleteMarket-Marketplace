import Link from "next/link";
import { DISCLAIMER } from "@/lib/constants";
import { Logo } from "./ui";

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://theathletemarket.com";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="The Athlete Market Evaluations home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium text-navy">
          <Link href="/coaches" className="hidden rounded-lg px-3 py-2 hover:bg-surface sm:block">Find a coach</Link>
          <Link href="/#how" className="hidden rounded-lg px-3 py-2 hover:bg-surface md:block">How it works</Link>
          <Link href="/join" className="hidden rounded-lg px-3 py-2 hover:bg-surface md:block">For coaches</Link>
          <Link href="/coaches" className="btn-primary btn-sm sm:hidden">Find a coach</Link>
          <a href={MAIN} className="hidden rounded-lg px-3 py-2 text-muted hover:bg-surface lg:block">theathletemarket.com ↗</a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-md text-sm leading-relaxed text-muted">{DISCLAIMER}</p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-navy">Families</p>
          <Link className="block text-muted hover:text-navy" href="/coaches">Find a coach</Link>
          <Link className="block text-muted hover:text-navy" href="/#faq">FAQ</Link>
          <a className="block text-muted hover:text-navy" href={MAIN}>The Athlete Market</a>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-navy">Company</p>
          <Link className="block text-muted hover:text-navy" href="/join">Become an evaluator</Link>
          <Link className="block text-muted hover:text-navy" href="/legal/terms">Terms</Link>
          <Link className="block text-muted hover:text-navy" href="/legal/privacy">Privacy</Link>
          <Link className="block text-muted hover:text-navy" href="/legal/evaluator-policy">Evaluator eligibility policy</Link>
        </div>
      </div>
      <div className="container-page border-t border-line py-5 text-xs text-subtle">
        © {new Date().getFullYear()} The Athlete Market. Payments processed securely by Stripe.
      </div>
    </footer>
  );
}
