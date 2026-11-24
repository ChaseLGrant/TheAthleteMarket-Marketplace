import Link from "next/link";
import { HeroAsk } from "@/components/hero-ask";
import { askPricing } from "@/lib/ask-pricing";
import { inboundEmailEnabled, paymentsOff, smsEnabled } from "@/lib/env";
import { money } from "@/lib/format";
import { getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";

const stepsFor = (sms: boolean, inbound: boolean) => [
  { n: "1", title: "Pick up to 5 colleges", body: "Type a school. We write the message for you — camp dates, events, what level you fit. Edit anything." },
  { n: "2", title: "We get it to the right coach", body: "It goes to the recruiting coordinator first. No answer? It moves to the next coach on staff automatically." },
  sms
    ? { n: "3", title: "The answer hits your phone", body: `A text the second they open it and the second they answer.${inbound ? " Reply to the email or text to keep talking." : ""}` }
    : { n: "3", title: "The answer hits your inbox", body: `An email the moment a coach opens it and the moment they answer.${inbound ? " Reply to keep talking." : ""}` },
];

const ANSWERS = [
  { icon: "⛺", label: "Camp invite", title: "Elite Prospect Camp", meta: "June 14–15 · On campus", cta: "Sign-up link included" },
  { icon: "📍", label: "Where to be seen", title: "We'll be at the Summer Showcase", meta: "July 8–10 · Atlanta, GA", cta: "Get your athlete there" },
  { icon: "🎯", label: "Honest level read", title: "Better fit at D2 right now", meta: "“Footwork is there — add 10 lbs.”", cta: "Know where to aim" },
];

const PAID_FAQ = [
  { q: "What if no one answers?", a: "Then that school is free. We save your card at checkout and only charge each school when a coach there actually answers. No answer in 5 days = $0 for that school." },
  { q: "Who gets my message?", a: "We route it to the right person on that staff — usually the recruiting coordinator or an assistant. If they don't answer within 48 hours, it automatically goes to the next coach. The first coach to answer is the one you hear from." },
  { q: "Why would a coach answer?", a: "They get paid to — every answer earns them money, and answering takes one tap: share camp dates, an event they'll be at, or their honest read. No logins, no apps." },
  { q: "Can I use my own email?", a: "Yes. Every school has a Coach Line address. Email it straight from Gmail or any inbox and we take it from there. The first time we'll ask for your athlete's details; after that, just reply YES." },
  { q: "Can I keep talking to the coach?", a: "Yes. Reply to the answer email or the text and it goes straight to the coach who answered. Your email and phone number stay private." },
  { q: "Do I need an account or app?", a: "No. One page to send, then everything happens in your email and texts." },
  { q: "Is an answer a recruiting offer?", a: "No. It's a coach's reply to your question — camp info, events, film feedback or fit — not an offer, scholarship or roster spot." },
];

const FREE_FAQ = [
  { q: "What if no one answers?", a: "If the first coach doesn't answer within 48 hours, we automatically send it to the next coach on that staff. If no one answers by the deadline, we let you know so you can reach more programs." },
  { q: "Who gets my message?", a: "We route it to the right person on that staff — usually the recruiting coordinator or an assistant. If they don't answer within 48 hours, it goes to the next coach. The first coach to answer is the one you hear from." },
  { q: "Why would a coach answer?", a: "Because it takes one tap. Every message arrives with the film, grad year and position, and the coach can answer with their camp dates, an event they'll be at, or their honest read — no logins, no apps." },
  ...PAID_FAQ.slice(3),
];

export default async function Home() {
  const deps = await getDeps();
  const settings = await deps.store.getSettings();
  const free = paymentsOff();
  const sms = smsEnabled();
  const inbound = inboundEmailEnabled();
  const STEPS = stepsFor(sms, inbound);
  // Only promise what is switched on: email-in needs inbound mail, "text back" needs Twilio.
  const FAQ = (free ? FREE_FAQ : PAID_FAQ)
    .filter((f) => inbound || (f.q !== "Can I use my own email?" && f.q !== "Can I keep talking to the coach?"))
    .map((f) => (f.q === "Do I need an account or app?" && !sms ? { ...f, a: "No. One page to send, then everything happens in your email." } : f));
  const packs = [1, 3, 5].map((n) => ({ n, total: askPricing(settings.ask_prices, n).total }));
  const coachEarns = Math.round((packs[0]!.total * settings.ask_coach_share_bps) / 10_000);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-x-clip bg-navy text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden opacity-60" style={{ background: "radial-gradient(60rem 30rem at 85% -10%, rgba(31,95,255,.55), transparent 60%), radial-gradient(40rem 20rem at 0% 120%, rgba(31,95,255,.35), transparent 60%)" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-white.png" alt="" aria-hidden className="pointer-events-none absolute -bottom-10 right-[-12%] w-[340px] opacity-[0.06] sm:right-[-2%] sm:w-[620px]" />
        <div className="container-page relative pb-20 pt-14 sm:pb-28 sm:pt-24">
          <p className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#BFD0FF] ring-1 ring-white/15">
            {free ? "Coach Line · Now open" : "Coach Line · Answered or it's free"}
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">The direct line to college coaches.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#C9D3EA]">
            Ask any staff about camp dates, the events they&apos;ll be at, and what level you fit. {free ? "Get a real answer, fast." : "Get a real answer — or pay nothing."}
          </p>
          <div className="mt-8"><HeroAsk /></div>
          <p className="mt-4 text-sm text-[#C9D3EA]">{free ? "Up to 5 schools at once · no account, no app" : <>From {money(packs[0]!.total)} a school · {money(packs[2]!.total)} for 5 · no account, no app</>}</p>
        </div>
      </section>

      {/* What you get back */}
      <section className="container-page py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Answers you can act on</h2>
        <p className="mt-2 max-w-2xl text-muted">Coaches answer in one tap, so you get the thing that actually moves recruiting forward.</p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ANSWERS.map((a) => (
            <div key={a.label} className="card min-w-0 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-blue">{a.icon} {a.label}</p>
              <p className="mt-3 text-lg font-bold">{a.title}</p>
              <p className="text-sm text-muted">{a.meta}</p>
              <p className="mt-4 text-sm font-semibold text-navy">{a.cta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How */}
      <section id="how" className="border-y border-line bg-surface">
        <div className="container-page py-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="min-w-0">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-blue text-lg font-bold text-white">{s.n}</span>
                <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {!free && (
        <>
      {/* Pricing */}
      <section id="pricing" className="container-page py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Only pay for answers</h2>
        <p className="mt-2 text-muted">Your card is saved, not charged. Each school is charged only when a coach there answers.</p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {packs.map((p) => (
            <Link key={p.n} href="/ask" className={`card min-w-0 p-6 transition hover:-translate-y-0.5 ${p.n === 3 ? "ring-2 ring-blue" : ""}`}>
              {p.n === 3 && <p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue">Most popular</p>}
              <p className="text-sm font-semibold text-muted">{p.n} school{p.n === 1 ? "" : "s"}</p>
              <p className="mt-1 text-4xl font-bold">{money(p.total)}</p>
              <p className="mt-1 text-sm text-muted">{p.n > 1 ? `${money(Math.round(p.total / p.n))} per school` : "One staff, one answer"}</p>
            </Link>
          ))}
        </div>
      </section>

        </>
      )}

      {/* Gmail (only once inbound email is live) */}
      {inbound && <section className="container-page pb-16">
        <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">Live in Gmail? Stay there.</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              Every school has a Coach Line address. Email it from your own inbox and we&apos;ll route it to the right coach. After your first message, sending another is as simple as replying <strong>YES</strong>.
            </p>
          </div>
          <Link href="/ask" className="btn-ghost shrink-0">Find a school&apos;s address</Link>
        </div>
      </section>}

      {/* Coaches */}
      <section className="bg-navy text-white">
        <div className="container-page flex flex-col gap-6 py-14 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight">{free ? "Coaches: answer recruits in one tap." : "Coaches: get paid for the emails you already answer."}</h2>
            <p className="mt-2 max-w-xl text-[#C9D3EA]">
              Every message comes with the film, grad year and position. Answer in one tap — camp dates, an event, your honest read{free ? "" : <> — and earn {money(coachEarns)}+ per answer</>}. Save your camps once; next time it&apos;s one tap.
            </p>
          </div>
          <Link href="/join" className="btn-primary shrink-0">{free ? "Save your camps" : "Start getting paid"}</Link>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container-page py-16">
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
        {!free && <p className="mt-8 text-sm text-muted">
          Want a full film breakdown instead? <Link href="/coaches" className="font-semibold text-blue">Get a written, voice or video evaluation →</Link>
        </p>}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org", "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            }),
          }}
        />
      </section>
    </>
  );
}
