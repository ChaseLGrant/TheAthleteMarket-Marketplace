import { Legal } from "@/components/legal";
export const metadata = { title: "Terms of Service" };
export default function Terms() {
  return (
    <Legal title="Terms of Service" updated="November 2026">
      <h2>1. What we offer</h2>
      <p>The Athlete Market (&ldquo;we&rdquo;) lets you request a short, recorded video evaluation (&ldquo;Evaluation&rdquo;) of an athlete&apos;s highlight film from an independent evaluator (&ldquo;Coach&rdquo;). Coaches are independent and are not our employees or agents.</p>
      <h2>2. No recruiting promise</h2>
      <p>An Evaluation is one person&apos;s opinion. It is not a recruiting contact, offer, scholarship, admission decision, roster spot, or endorsement by any coach, school, conference or governing body. We do not guarantee any athletic, academic or recruiting outcome.</p>
      <h2>3. Payment, delivery and cancellations</h2>
      <ul>
        <li>At checkout, Stripe places an authorization hold for the listed price on your card. Your card is charged only when the Coach delivers the video. We do not store card numbers.</li>
        <li>The Coach has the stated delivery window (currently 5 days) to record. If they decline, don&apos;t deliver in time, or become unavailable, we release the hold and you are not charged. How quickly a released hold disappears from your statement depends on your bank.</li>
        <li>Once a qualifying video is delivered, the purchase is complete. If you believe a video is not a genuine good-faith evaluation, contact us within 14 days and we will review it.</li>
        <li>If a refund of a charged payment is approved, timing depends on your bank (typically 5–10 business days).</li>
      </ul>
      <h2>4. Minors</h2>
      <p>Requests for athletes under 18 must be placed by a parent or legal guardian, who consents to sharing the athlete&apos;s information with the selected Coach.</p>
      <h2>5. Your content</h2>
      <p>You confirm you have the right to share the film link and details you provide. Videos are delivered privately for your personal use; please don&apos;t publish them without the Coach&apos;s permission.</p>
      <h2>6. Coaches</h2>
      <p>Coaches must be verified and approved under our Evaluator Eligibility Policy before receiving paid requests, must comply with all rules that apply to them, and are paid via Stripe Connect after delivering a qualifying video and completing Stripe&apos;s identity and payout requirements. Deposit timing is set by Stripe.</p>
      <h2>7. Acceptable use</h2>
      <p>No harassment, spam, or attempts to contact Coaches outside the platform to circumvent these terms. We may refuse or cancel any request.</p>
      <h2>8. Liability</h2>
      <p>To the maximum extent permitted by law, our total liability for any claim is limited to the amount you paid for the Evaluation in question.</p>
      <h2>9. Contact</h2>
      <p>Reply to any email from us, or contact support at the address on our main site.</p>
    </Legal>
  );
}
