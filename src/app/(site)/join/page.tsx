import type { Metadata } from "next";
import { ApplyForm } from "@/components/apply-form";

export const metadata: Metadata = {
  title: "Become a paid evaluator",
  description: "Former college coaches and independent evaluators: earn $30–$50 for 30–60 second video feedback, recorded on your phone. No app, no account.",
  alternates: { canonical: "/join" },
};

export default function Join() {
  return (
    <div className="container-page grid max-w-5xl gap-10 py-12 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="eyebrow">For coaches</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Get paid for the evaluations you already know how to give.</h1>
        <ul className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted">
          <li><strong className="text-navy">Requests come to your inbox.</strong> Each email has the athlete, the film and what you&apos;ll earn.</li>
          <li><strong className="text-navy">Record 30–60 seconds in your browser.</strong> No app, no account, no password.</li>
          <li><strong className="text-navy">Paid automatically via Stripe</strong> after you deliver. You keep 100% of the listed price during our pilot.</li>
          <li><strong className="text-navy">Always optional.</strong> Decline anything with one tap; the family is refunded.</li>
        </ul>
        <div className="mt-8 rounded-2xl bg-blue-50 p-5 text-sm leading-relaxed text-navy ring-1 ring-blue-100">
          <p className="font-semibold">Currently on a college staff?</p>
          <p className="mt-1 text-muted">
            NCAA, NAIA, NJCAA and CCCAA rules, and your institution, may prohibit you from accepting payment to evaluate prospects. Our pilot is
            open to former coaches and independent evaluators. Active staff can apply, but cannot receive paid requests without documented written
            authorization from both their compliance office and the applicable governing body.
          </p>
        </div>
      </div>
      <div className="card p-6 sm:p-8"><ApplyForm /></div>
    </div>
  );
}
