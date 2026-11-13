import Link from "next/link";
import { CoachCard } from "@/components/ui";
import { SPORTS } from "@/lib/constants";
import { annotate, getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "1", title: "Pick a coach", body: "Search verified college-level evaluators by sport, division, conference or state." },
  { n: "2", title: "Share your film", body: "Paste your Hudl or YouTube link and a few details. Checkout takes about a minute." },
  { n: "3", title: "Get your video", body: "Your coach records a personal 30–60 second evaluation. We email you a private link." },
];

const FAQ = [
  {
    q: "What exactly do I get?",
    a: "A private 30–60 second video in which the coach gives you their honest read on your highlight film: strengths, what to improve, and how your film comes across to a college staff.",
  },
  {
    q: "What if the coach doesn't respond?",
    a: "Coaches have 7 days. If they decline or don't deliver in time, you're refunded in full automatically — no forms, no emails.",
  },
  {
    q: "Is this a recruiting offer?",
    a: "No. An evaluation is feedback only. It is not a recruiting contact, scholarship, admission decision, roster spot or endorsement, and nobody can promise you one.",
  },
  {
    q: "Who are the coaches?",
    a: "Paid requests are only available for evaluators we've verified and approved under our eligibility policy — for example former college coaches and independent evaluators. Some coaches appear as directory listings from public information only; they are not on the platform and can't be booked.",
  },
  {
    q: "Do I need an account?",
    a: "No. No account, no password, no app. You'll get a receipt and your private video link by email.",
  },
  {
    q: "Is my child's information private?",
    a: "Yes. Requests for athletes under 18 must be placed by a parent or guardian. We share only what the coach needs to evaluate the film, and your video link is private.",
  },
];

export default async function Home() {
  const deps = await getDeps();
  const settings = await deps.store.getSettings();
  const { coaches } = await deps.store.searchCoaches({ availableOnly: true, limit: 6 });
  const featured = annotate(coaches, settings).filter((x) => x.available);
  const minPrice = Math.min(...settings.price_tiers_cents) / 100;
  const maxPrice = Math.max(...settings.price_tiers_cents) / 100;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(60rem 30rem at 85% -10%, rgba(31,95,255,.55), transparent 60%), radial-gradient(40rem 20rem at 0% 120%, rgba(31,95,255,.35), transparent 60%)" }} />
        <div className="container-page relative py-16 sm:py-24">
          <p className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#BFD0FF] ring-1 ring-white/15">
            Delivered in 7 days or a full refund
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Honest feedback on your film from a college-level coach.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#C9D3EA]">
            A personal 30–60 second video evaluation of your highlight reel. ${minPrice}–${maxPrice}. No accounts, no app.
          </p>
          <form action="/coaches" className="mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,.5)] sm:flex-row">
            <label htmlFor="hero-q" className="sr-only">Search coaches</label>
            <input id="hero-q" name="q" placeholder="Coach, college or conference" className="h-12 flex-1 rounded-xl px-4 text-[16px] text-navy outline-none placeholder:text-subtle" />
            <label htmlFor="hero-sport" className="sr-only">Sport</label>
            <select id="hero-sport" name="sport" defaultValue="" className="field h-12 border-0 bg-surface sm:w-48">
              <option value="">All sports</option>
              {SPORTS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="btn-primary h-12 sm:px-7">Find a coach</button>
          </form>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#C9D3EA]">
            <li>✓ Verified evaluators</li>
            <li>✓ Secure Stripe checkout</li>
            <li>✓ Private video link</li>
          </ul>
        </div>
      </section>

      {/* Featured */}
      <section className="container-page py-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Available now</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Verified evaluators</h2>
          </div>
          <Link href="/coaches?available=1" className="text-sm font-semibold text-blue hover:underline">See all →</Link>
        </div>
        {featured.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map(({ coach, available }) => <CoachCard key={coach.id} coach={coach} available={available} />)}
          </div>
        ) : (
          <p className="card p-8 text-center text-muted">Our first evaluators are being verified. <Link className="font-semibold text-blue" href="/coaches">Browse the directory</Link>.</p>
        )}
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-line bg-surface">
        <div className="container-page py-16">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Three steps. About two minutes.</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="card p-6">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue text-sm font-bold text-white">{s.n}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Guarantee */}
      <section className="container-page py-16">
        <div className="grid items-center gap-8 rounded-3xl bg-blue-50 p-8 sm:p-12 md:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Video or your money back. Automatically.</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              You pay once at checkout. If the coach declines or doesn&apos;t record within 7 days, Stripe returns every cent to your card —
              you don&apos;t have to ask. Coaches are paid only after they deliver.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-center">
            {[["30–60s", "personal video"], ["7 days", "delivery window"], ["100%", "refund if no video"], ["0", "accounts or apps"]].map(([k, v]) => (
              <div key={v} className="rounded-2xl bg-white p-4 ring-1 ring-blue-100">
                <dt className="text-2xl font-bold text-navy">{k}</dt>
                <dd className="text-xs text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container-page pb-8">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Questions</h2>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold">
                {f.q}
                <span aria-hidden className="text-xl text-blue transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            }),
          }}
        />
      </section>
    </>
  );
}
