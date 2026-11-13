import { Legal } from "@/components/legal";
export const metadata = { title: "Privacy Policy" };
export default function Privacy() {
  return (
    <Legal title="Privacy Policy" updated="November 2026">
      <h2>What we collect</h2>
      <ul>
        <li>Athlete details you enter: name, sport, position, graduation year, film link, and any optional metrics, GPA or note.</li>
        <li>Purchaser name and email; optional athlete email.</li>
        <li>Payment information is collected and processed by Stripe; we receive only payment status and limited metadata.</li>
        <li>The Coach&apos;s recorded video.</li>
      </ul>
      <h2>How we use it</h2>
      <p>Only to fulfil your request: to send the Coach the information needed to evaluate the film, to deliver the video, to process payments and refunds, to prevent fraud, and to meet legal obligations. We do not sell personal information and we do not use athletes&apos; information for advertising.</p>
      <h2>Who sees it</h2>
      <ul>
        <li>The Coach you select sees the athlete details and optional fields. Optional fields (GPA, metrics, note) appear only on the secure page, not in email.</li>
        <li>Service providers acting for us: Stripe (payments), Supabase (database and private video storage), Resend (email), Twilio (text messages to coaches), Vercel (hosting).</li>
      </ul>
      <h2>Minors</h2>
      <p>We do not knowingly accept requests from children under 18 without a parent or guardian, who must consent at checkout. Parents may request access to or deletion of their child&apos;s information at any time.</p>
      <h2>Security and retention</h2>
      <p>Videos are stored privately and served only through short-lived signed links. Each video is deleted automatically 30 days after delivery (please download it to keep it), unless it is needed as evidence in an open payment dispute. Athlete details are deleted automatically after the retention period (currently 12 months); limited transaction records are kept as required for accounting and tax.</p>
      <h2>Text messages (coaches)</h2>
      <p>
        Coaches who opt in receive text messages about new evaluation requests and deadlines. Message frequency varies; message and data
        rates may apply. Reply STOP to opt out or HELP for help. We use Twilio to send texts. <strong>Mobile numbers and text-message
        opt-in data are never shared with or sold to third parties or affiliates for marketing or promotional purposes.</strong>
      </p>
      <h2>Your choices</h2>
      <p>Reply to any of our emails to access, correct or delete your information, or to revoke a video link. Coaches can stop all emails with one click.</p>
    </Legal>
  );
}
