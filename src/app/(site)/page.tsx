import Link from "next/link";
import { CoachCard } from "@/components/ui";
import { SPORTS } from "@/lib/constants";
import { money } from "@/lib/format";
import { annotate, getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "1", title: "Pick any coach", body: "Search by name, school or sport — or enter any coach's email. College coaches, grad assistants, pros." },
  { n: "2", title: "Choose your reply", body: "A written take, a voice note or a video. Add your film link and pay in about a minute." },
  { n: "3", title: "Get it in your inbox", body: "The coach replies from their own email. It lands in yours, with a text when it arrives." },
];

const FAQ = [
  {
    q: "What exactly do I get?",
    a: "The coach's honest read on your film — what level they see you at (D1, D2, D3, NAIA, JUCO or not yet), your top strength, what to work on and your next step. As a written reply, a 1–2 minute voice note, or a 30–60 second video.",
  },
  {
    q: "What if the coach doesn't reply?",
    a: "Then you pay nothing. Your card is only held at checkout and charged when the coach replies. No reply within 5 days? The hold is released, and we'll help you pick another coach in one tap.",
  },
  {
    q: "Do I need an account or an app?",
    a: "No. You pay on one page. Everything after that happens in your own email (and texts, if you like). The coach's reply is yours to keep and forward.",
  },
  {
    q: "Who are the coaches?",
    a: "Any coach you want — college head coaches, assistants and grad assistants, former coaches, independent evaluators and professional players. If a coach hasn't joined yet, we email them your request. Listings aren't an endorsement by any coach, school or team.",
  },
  {
    q: "Is this a recruiting offer?",
    a: "No. It's one coach's honest feedback — not a recruiting contact, scholarship, admission decision or roster spot.",
  },
  {
    q: "Is my child's information private?",
    a: "Yes. Requests for athletes under 18 are placed by a parent or guardian. Messages go through The Athlete Market, so the coach never gets your email or phone number, and you never need theirs.",
  },
];

export default async function Home() {
  const deps = await getDeps();
  const settings = await deps.store.getSettings();
  const fp = settings.format_prices;
  const joined = (await deps.store.searchCoaches({ availableOnly: true, limit: 6 })).coaches;
  const more = joined.length < 6 ? (await deps.store.searchCoaches({ limit: 12 })).coaches.filter((c) => !joined.some((j) => j.id === c.id)) : [];
  const featured = annotate([...joined, ...more].slice(0, 6), settings).filter((x) => x.availability !== "unavailable");
  const fromPrice = Math.min(fp.written, fp.voice, fp.video);

  const formats = [
    { icon: "✍️", title: "Written take", price: fp.written, body: "Level read, top strength, what to fix, next step." },
    { icon: "🎙️", title: "Voice note", price: fp.voice, body: "1–2 minutes in the coach's own voice." },
    { icon: "🎥", title: "Video breakdown", price: fp.video, body: "A personal 30–60 second video." },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(60rem 30rem at 85% -10%, rgba(31,95,255,.55), transparent 60%), radial-gradient(40rem 20rem at 0% 120%, rgba(31,95,255,.35), transparent 60%)" }} />
        <div className="container-page relative pb-20 pt-14 sm:pb-28 sm:pt-24">
          <p className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#BFD0FF] ring-1 ring-white/15">
            A real reply — or you pay nothing
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Ask any college coach what level they see you at.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#C9D3EA]">
            Their honest reply lands in your inbox — written, voice note or video. From {money(fromPrice)}. No account, no app.
          </p>
          <form action="/coaches" className="mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,.5)] sm:flex-row">
            <label htmlFor="hero-q" className="sr-only">Search coaches</label>
            <input id="hero-q" name="q" placeholder="Coach name, college or team" className="h-12 flex-1 rounded-xl px-4 text-[16px] text-navy outline-none placeholder:text-subtle" />
            <label htmlFor="hero-sport" className="sr-only">Sport</label>
            <select id="hero-sport" name="sport" defaultValue="" className="field h-12 border-0 bg-surface sm:w-48">
              <option value="">All sports</option>
              {SPORTS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="btn-primary h-12 sm:px-7">Find a coach</button>
          </form>
          <p className="mt-4 text-sm text-[#C9D3EA]">
            Know who you want? <Link href="/coaches/add" className="font-semibold text-white underline">Enter any coach&apos;s email →</Link>
          </p>
        </div>
      </section>

      {/* Formats */}
      <section className="container-page -mt-10">
        <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-3">
          {formats.map((f) => (
            <div key={f.title} className="card flex items-center gap-4 p-5 sm:flex-col sm:items-start">
              <span aria-hidden className="text-3xl">{f.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{f.title}</p>
                <p className="text-sm text-muted">{f.body}</p>
              </div>
              <p className="text-xl font-bold">{money(f.price)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="container-page py-16">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">One page. Then it all happens in your inbox.</h2>
        <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-6">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue text-sm font-bold text-white">{s.n}</span>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Guarantee */}
      <section className="container-page pb-16">
        <div className="grid grid-cols-1 items-center gap-8 rounded-3xl bg-blue-50 p-8 sm:p-12 md:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">A real reply, or you pay nothing.</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              We hold your card at checkout and only charge it when the coach replies. If they don&apos;t reply within {settings.deadline_days} days,
              the hold is released automatically — and we&apos;ll help you ask another coach in one tap, with your details already saved.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-center">
            {[[money(fromPrice), "starting price"], [`${settings.deadline_days} days`, "reply window"], ["$0", "if no reply"], ["0", "accounts or apps"]].map(([k, v]) => (
              <div key={v} className="rounded-2xl bg-white p-4 ring-1 ring-blue-100">
                <dt className="text-2xl font-bold text-navy">{k}</dt>
                <dd className="text-xs text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Coaches */}
      <section className="border-y border-line bg-surface">
        <div className="container-page py-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Ask any coach</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Coaches families are asking</h2>
            </div>
            <Link href="/coaches" className="text-sm font-semibold text-blue hover:underline">See all →</Link>
          </div>
          {featured.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map(({ coach, availability }) => (
                <CoachCard key={coach.id} coach={coach} availability={availability} tiers={settings.price_tiers_cents} fromPrice={fromPrice} />
              ))}
            </div>
          ) : (
            <p className="card p-8 text-center text-muted"><Link className="font-semibold text-blue" href="/coaches/add">Ask any coach by email</Link>.</p>
          )}
        </div>
      </section>

      {/* For coaches */}
      <section className="container-page py-16">
        <div className="card flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">For coaches</p>
            <p className="mt-1 text-xl font-bold">Make side money from your inbox — no camps, no app.</p>
            <p className="mt-1 text-muted">Families send you their film. You reply in about 2 minutes. You keep 80%.</p>
          </div>
          <Link href="/join" className="btn-navy shrink-0">Claim your coach profile</Link>
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
