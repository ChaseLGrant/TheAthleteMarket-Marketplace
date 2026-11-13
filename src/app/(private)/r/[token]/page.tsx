import { notFound } from "next/navigation";
import Link from "next/link";
import { Recorder } from "@/components/recorder";
import { Notice } from "@/components/ui";
import { dateOnly, money } from "@/lib/format";
import { filmEmbedUrl, filmHost } from "@/lib/film";
import { resolveCoachLink } from "@/lib/services/access";
import { payoutsUrl } from "@/lib/services/links";
import { markViewed } from "@/lib/services/lifecycle";
import { getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function CoachRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deps = await getDeps();
  const found = await resolveCoachLink(deps, token);
  if (!found) notFound();
  const { req, coach } = found;
  const open = ["paid", "coach_notified", "accepted"].includes(req.status);
  const expired = !req.expires_at || new Date(req.expires_at) <= deps.now();
  if (open && !expired) await markViewed(deps, req);
  const first = req.athlete_name.split(" ")[0]!;
  const amount = money(req.coach_payout_cents);
  const embed = filmEmbedUrl(req.film_url);
  const hoursLeft = req.expires_at ? Math.max(0, (Date.parse(req.expires_at) - deps.now().getTime()) / 3_600_000) : 0;

  if (req.status === "submitted" || req.status === "completed") {
    const needsSetup = req.payout_status === "blocked" && /payout setup/i.test(req.payout_block_reason ?? "");
    return (
      <div className="space-y-4">
        <div className="card p-6 text-center">
          <p className="text-4xl">✓</p>
          <h1 className="mt-2 text-2xl font-bold">Video delivered — thank you, Coach</h1>
          <p className="mt-1 text-muted">{req.athlete_name}&apos;s family has your evaluation.</p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-muted">Your payment</p>
          <p className="text-3xl font-bold">{amount}</p>
          <p className="mt-2 text-sm font-medium">
            {req.payout_status === "paid" ? "✅ Sent to your Stripe account. It will reach your bank on Stripe's payout schedule." :
              needsSetup ? "One step left: set up payouts so we can send your money." :
              req.status === "submitted" ? "Your video is being reviewed; payment follows automatically." :
              req.payout_status === "blocked" ? "Payment is on hold while we complete a review. We'll email you." :
              "Payment is processing."}
          </p>
          {(needsSetup || req.payout_status === "paid") && (
            <Link href={payoutsUrl(coach).replace(/^https?:\/\/[^/]+/, "")} className="btn-primary mt-4 w-full">
              {needsSetup ? "Set up payouts with Stripe" : "View payouts"}
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!open || expired) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-xl font-bold">This request is closed</h1>
        <p className="mt-2 text-muted">
          {req.status === "declined" || req.decline_reason ? "You declined this request and the family was refunded." :
            "The deadline passed, so the family was refunded in full. No action is needed."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <div className="bg-navy px-6 py-5 text-white">
          <p className="text-sm text-[#BFD0FF]">Paid evaluation request for Coach {coach.full_name.split(" ").slice(-1)[0]}</p>
          <h1 className="mt-1 text-2xl font-bold">{req.athlete_name}</h1>
          <p className="text-[#C9D3EA]">{req.sport} · {req.position} · Class of {req.grad_year}</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-line border-b border-line text-center">
          <div className="p-4"><p className="text-xs text-muted">You receive</p><p className="text-xl font-bold text-success">{amount}</p></div>
          <div className="p-4"><p className="text-xs text-muted">Respond by</p><p className="text-xl font-bold">{dateOnly(req.expires_at)}</p>
            <p className="text-xs text-muted">{hoursLeft > 48 ? `${Math.floor(hoursLeft / 24)} days left` : `${Math.ceil(hoursLeft)} hours left`}</p></div>
        </div>
        {(req.metrics || req.gpa || req.message) && (
          <dl className="space-y-3 p-6 text-sm">
            {req.metrics && <div><dt className="text-muted">Metrics</dt><dd className="font-medium">{req.metrics}</dd></div>}
            {req.gpa && <div><dt className="text-muted">GPA</dt><dd className="font-medium">{req.gpa}</dd></div>}
            {req.message && <div><dt className="text-muted">Note from the family</dt><dd className="whitespace-pre-line font-medium">{req.message}</dd></div>}
          </dl>
        )}
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">1. Watch the film</h2>
        {embed ? (
          <div className="mt-3 aspect-video overflow-hidden rounded-xl bg-black">
            <iframe src={embed} title={`${req.athlete_name} highlight film`} className="h-full w-full" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" />
          </div>
        ) : null}
        <a href={req.film_url} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost mt-3 w-full">Open film on {filmHost(req.film_url)} ↗</a>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">2. Record 30–60 seconds</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li>• Introduce yourself and what you watched</li>
          <li>• 1–2 genuine strengths</li>
          <li>• 1–2 things to improve, and one next step</li>
          <li>• Please don&apos;t promise an offer, scholarship, admission or roster spot</li>
        </ul>
        <div className="mt-4"><Recorder token={token} athleteFirstName={first} amountLabel={amount} /></div>
      </section>

      <Notice tone="info">
        Payment is sent via Stripe after you submit. First time? You&apos;ll complete a quick, secure Stripe payout setup — we never see your bank login.
      </Notice>
      <p className="pb-6 text-center text-sm">
        <Link href={`/r/${token}/decline`} className="font-medium text-muted underline">Can&apos;t do this one? Decline and refund the family</Link>
      </p>
    </div>
  );
}
