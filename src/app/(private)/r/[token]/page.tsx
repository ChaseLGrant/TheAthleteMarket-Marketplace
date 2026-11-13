import { notFound } from "next/navigation";
import Link from "next/link";
import { Recorder } from "@/components/recorder";
import { FilmIssueButton } from "@/components/film-issue";
import { Notice } from "@/components/ui";
import { dateOnly, money } from "@/lib/format";
import { filmEmbedUrl, filmHost } from "@/lib/film";
import { resolveCoachLink } from "@/lib/services/access";
import { payoutsUrl } from "@/lib/services/links";
import { markViewed } from "@/lib/services/lifecycle";
import { mailtoReply } from "@/lib/services/email-native";
import { WrittenReplyForm } from "@/components/written-reply-form";
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
          {req.status === "declined" || req.decline_reason ? "You declined this request, so the family wasn't charged." :
            "The deadline passed, so the family wasn't charged. No action is needed."}
        </p>
      </div>
    );
  }

  const recorder = (
    <Recorder
      uploadUrlEndpoint={`/api/coach/${token}/upload-url`}
      submitEndpoint={`/api/coach/${token}/submit`}
      acceptEndpoint={`/api/coach/${token}/accept`}
      submitLabel={`Submit & claim ${amount}`}
      prompts={["Who you are + what you watched", `What level you see ${first} at`, "Strengths, fixes + one next step"]}
      withTakeaways
      done={
        <div className="rounded-2xl bg-success-50 p-6 text-center ring-1 ring-[#c3e8d2]">
          <p className="text-4xl">✓</p>
          <p className="mt-2 text-xl font-bold text-navy">Sent to {first}&apos;s family</p>
          <p className="mt-1 text-sm text-muted">Your {amount} is on its way via Stripe. You can close this page.</p>
        </div>
      }
    />
  );

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
        {req.film_issue_at ? (
          <p className="mt-3 rounded-xl bg-warn-50 px-4 py-3 text-sm text-[#6b3d00]">
            You reported the film wouldn&apos;t open. We&apos;ve asked the family for a new link and will email{coach.sms_opt_in_at ? " and text" : ""} you the moment it arrives.
          </p>
        ) : (
          <FilmIssueButton token={token} />
        )}
      </section>

      {req.format !== "video" ? (
        <section className="card p-5">
          <h2 className="font-semibold">2. {req.format === "voice" ? "Send a 1–2 minute voice memo" : "Send your written take"}</h2>
          <p className="mt-1 text-sm text-muted">
            {req.format === "voice"
              ? "Easiest from your phone: tap below, attach a voice memo (Voice Memos → ••• → Share → Mail) and send."
              : "Easiest from your phone: tap below — your email app opens with the template ready. Fill it in and send."}
          </p>
          <a href={mailtoReply(req)} className="btn-primary mt-4 w-full">✉︎ Reply from my email</a>
          {req.format === "written" && (
            <details className="mt-4 rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-semibold">Or type it here instead</summary>
              <div className="mt-3"><WrittenReplyForm token={token} amount={amount} first={first} /></div>
            </details>
          )}
          {req.format === "voice" && (
            <details className="mt-4 rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-semibold">Or record a short video here instead</summary>
              <div className="mt-3">{recorder}</div>
            </details>
          )}
        </section>
      ) : (
        <section className="card p-5">
          <h2 className="font-semibold">2. Record 30–60 seconds</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>• Introduce yourself and what you watched</li>
            <li>• What level you see {first} at</li>
            <li>• 1–2 strengths, 1–2 things to improve, and one next step</li>
          </ul>
          <div className="mt-4">{recorder}</div>
          <p className="mt-3 text-center text-sm text-muted">
            Prefer email? <a href={mailtoReply(req)} className="font-semibold text-blue">Reply with a video or a link</a>.
          </p>
        </section>
      )}

      <Notice tone="info">
        Your {amount} is sent via Stripe as soon as your reply is delivered. Not for you? Reply PASS to our email, or decline below.
      </Notice>
      <p className="pb-6 text-center text-sm">
        <Link href={`/r/${token}/decline`} className="font-medium text-muted underline">Can&apos;t do this one? Decline it</Link>
      </p>
    </div>
  );
}
