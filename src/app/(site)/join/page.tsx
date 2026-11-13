import type { Metadata } from "next";
import { ApplyForm } from "@/components/apply-form";

export const metadata: Metadata = {
  title: "Become a paid evaluator",
  description: "Former college coaches and independent evaluators: earn $40 for each 30–60 second video evaluation, recorded on your phone. No app, no account.",
  alternates: { canonical: "/join" },
};

export default function Join() {
  return (
    <div className="container-page grid max-w-5xl gap-10 py-12 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="eyebrow">For coaches</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Get paid for the evaluations you already know how to give.</h1>
        <p className="mt-3 text-[15px] text-muted">For college assistants and grad assistants, former college coaches, independent evaluators and professional players.</p>
        <ul className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted">
          <li><strong className="text-navy">Requests come to your inbox.</strong> Each email has the athlete, the film and what you&apos;ll earn.</li>
          <li><strong className="text-navy">Record 30–60 seconds in your browser.</strong> No app, no account, no password.</li>
          <li><strong className="text-navy">Paid automatically via Stripe</strong> after you deliver. You receive $40 for every $50 evaluation.</li>
          <li><strong className="text-navy">Always optional.</strong> Decline anything with one tap; the family is never charged.</li>
        </ul>
        <div className="mt-8 rounded-2xl bg-blue-50 p-5 text-sm leading-relaxed text-navy ring-1 ring-blue-100">
          <p className="font-semibold">Who can join?</p>
          <p className="mt-1 text-muted">
            College head coaches, assistants and grad assistants, former college coaches, independent evaluators and professional players.
            No approval process — confirm your email and families can request you right away.
          </p>
        </div>
      </div>
      <div className="card p-6 sm:p-8"><ApplyForm /></div>
    </div>
  );
}
