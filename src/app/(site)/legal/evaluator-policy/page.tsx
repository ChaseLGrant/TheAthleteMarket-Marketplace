import { Legal } from "@/components/legal";
export const metadata = { title: "Evaluator Eligibility Policy" };
export default function Policy() {
  return (
    <Legal title="Evaluator Eligibility Policy" updated="November 2026">
      <p>We only offer paid requests for coaches we have verified and approved. This page explains the gate every coach must pass. It is not legal advice.</p>
      <h2>Why this exists</h2>
      <p>Rules of college athletics governing bodies (NCAA, NAIA, NJCAA, CCCAA) and individual institutions can restrict currently employed college coaches from receiving compensation connected to evaluating prospective student-athletes, regardless of who pays or whether a platform takes a commission.</p>
      <h2>Requirements before any paid request</h2>
      <ul>
        <li>Identity verified by The Athlete Market.</li>
        <li>Documented eligibility basis reviewed and approved, with a review date and (optionally) an expiry.</li>
        <li>For a coach currently employed by a college: written authorization from the institution&apos;s compliance office <em>and</em> applicable governing-body guidance recorded on file, and the platform-wide setting for active coaches enabled. During our pilot this setting is off.</li>
        <li>A price from our configured tiers, and an email address that has not opted out.</li>
      </ul>
      <h2>Before every payout</h2>
      <p>We re-check eligibility, require completed Stripe identity verification and payout setup, and hold payouts on disputed payments.</p>
      <h2>Directory listings</h2>
      <p>We may list coaches from public information so families can search. A directory listing is clearly labelled, cannot be booked, and does not mean the coach participates in, is affiliated with, or endorses The Athlete Market. Coaches can ask us to remove a listing at any time.</p>
      <h2>Conduct</h2>
      <p>Evaluators must give honest, good-faith feedback and must never promise or imply recruitment, a scholarship, admission or a roster spot.</p>
    </Legal>
  );
}
