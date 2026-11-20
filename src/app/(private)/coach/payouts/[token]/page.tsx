import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Recorder } from "@/components/recorder";
import { Notice, Stars } from "@/components/ui";
import { env, paymentsOff } from "@/lib/env";
import { dateOnly, money } from "@/lib/format";
import { prettyPhone, toE164 } from "@/lib/phone";
import { resolvePayoutsLink } from "@/lib/services/access";
import { setPaused } from "@/lib/services/experience";
import { deliveryBadge } from "@/lib/services/coach-stats";
import { coachReviewUrl } from "@/lib/services/links";
import { answerUrl, coachLineAddress } from "@/lib/services/line";
import { retryPayoutsForCoach, startOnboarding, syncAccount } from "@/lib/services/lifecycle";
import { getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ token: string }>; searchParams: Promise<{ returned?: string; sms?: string }> };

const SMS_CONSENT =
  "I agree to receive text messages from The Athlete Market about new evaluation requests and deadlines. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent isn't required to participate.";

/** The coach's private hub (magic link from their emails — no account). */
export default async function CoachHub({ params, searchParams }: P) {
  const { token } = await params;
  const { returned, sms } = await searchParams;
  const deps = await getDeps();
  let coach = await resolvePayoutsLink(deps, token);
  if (!coach) notFound();
  if (coach.stripe_account_id) coach = await syncAccount(deps, coach);
  // Opening this emailed link proves they own the address → self-signups go live.
  if (!coach.email_confirmed_at) coach = await deps.store.updateCoach(coach.id, { email_confirmed_at: deps.now().toISOString() });
  if (returned && coach.stripe_transfers_active) await retryPayoutsForCoach(deps, coach.id);

  const all = await deps.store.listRequests({ coach_id: coach.id, limit: 200 });
  const now = deps.now();
  const open = all.filter((r) => ["paid", "coach_notified", "accepted"].includes(r.status) && r.expires_at && new Date(r.expires_at) > now);
  const owed = all.filter((r) => r.status === "completed" && r.payout_status !== "paid" && r.payout_status !== "reversed").reduce((s, r) => s + r.coach_payout_cents, 0);
  const earned = all.filter((r) => r.payout_status === "paid").reduce((s, r) => s + r.coach_payout_cents, 0);
  const ready = coach.stripe_transfers_active && coach.stripe_details_submitted;
  const introSrc = coach.intro_video_path ? await deps.storage.playbackUrl(coach.intro_video_path, 3600).catch(() => null) : null;
  const speed = deliveryBadge(coach);
  const first = coach.full_name.split(" ")[0];
  const self = `/coach/payouts/${token}`;

  async function continueToStripe() {
    "use server";
    const d = await getDeps();
    const c = await resolvePayoutsLink(d, token);
    if (!c) return;
    const base = `${env.siteUrl()}/coach/payouts/${token}`;
    const isReady = c.stripe_transfers_active && c.stripe_details_submitted;
    const link = isReady && c.stripe_account_id
      ? await d.payments.createDashboardLink(c.stripe_account_id)
      : await startOnboarding(d, c, { refreshUrl: base, returnUrl: `${base}?returned=1` });
    redirect(link.url);
  }

  async function togglePause() {
    "use server";
    const d = await getDeps();
    const c = await resolvePayoutsLink(d, token);
    if (c) await setPaused(d, c, !c.paused);
    revalidatePath(self);
  }

  async function saveSms(fd: FormData) {
    "use server";
    const d = await getDeps();
    const c = await resolvePayoutsLink(d, token);
    if (!c) return;
    if (fd.get("op") === "off") {
      await d.store.updateCoach(c.id, { sms_opt_in_at: null });
      redirect(`${self}?sms=off`);
    }
    const phone = toE164(String(fd.get("phone") ?? ""));
    if (!phone || fd.get("consent") !== "on") redirect(`${self}?sms=invalid`);
    await d.store.updateCoach(c.id, { phone, sms_opt_in_at: d.now().toISOString(), sms_opted_out: false });
    redirect(`${self}?sms=on`);
  }

  async function saveItem(fd: FormData) {
    "use server";
    const d = await getDeps();
    const c = await resolvePayoutsLink(d, token);
    if (!c) return;
    const which = fd.get("which") === "event" ? "events" : "camps";
    const list = [...(c[which] ?? [])];
    if (fd.get("op") === "remove") list.splice(Number(fd.get("i")), 1);
    else {
      const name = String(fd.get("name") ?? "").trim().slice(0, 120), dates = String(fd.get("dates") ?? "").trim().slice(0, 80);
      const location = String(fd.get("location") ?? "").trim().slice(0, 120) || undefined;
      const url = String(fd.get("url") ?? "").trim().slice(0, 500);
      if (name.length < 2 || dates.length < 2) redirect(`${self}?item=invalid#camps`);
      list.push({ name, dates, location, ...(which === "camps" && /^https:\/\//.test(url) ? { url } : {}) });
    }
    await d.store.updateCoach(c.id, { [which]: list.slice(-6) });
    revalidatePath(self);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">Coach hub</p>
        <h1 className="text-2xl font-bold">Welcome back, {first}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
          <Stars coach={coach} />
          {speed && <span className="text-success">⚡ {speed}</span>}
          <Link href={`/coaches/${coach.slug}`} className="font-medium text-blue">View my public profile ↗</Link>
        </div>
      </div>

      {/* Earnings */}
      <div className="grid grid-cols-3 gap-3">
        {[["Earned", money(earned)], ["On the way", money(owed)], ["Delivered", String(coach.delivered_count)]].map(([k, v]) => (
          <div key={k} className="card p-4 text-center"><p className="text-xs text-muted">{k}</p><p className="mt-1 text-xl font-bold">{v}</p></div>
        ))}
      </div>

      {/* Open requests */}
      <section className="card p-5">
        <h2 className="font-semibold">Open requests ({open.length})</h2>
        {open.length ? (
          <ul className="mt-3 divide-y divide-line">
            {open.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.athlete_name} · {r.position} · {r.grad_year}</p>
                  <p className="text-xs text-muted">{money(r.coach_payout_cents)} · respond by {dateOnly(r.expires_at)}{r.film_issue_at ? " · waiting on new film link" : ""}</p>
                </div>
                <Link href={(r.format === "ask" ? answerUrl(r, coach) : coachReviewUrl(r)).replace(/^https?:\/\/[^/]+/, "")} className="btn-primary btn-sm shrink-0">{r.format === "ask" ? "Answer →" : "Reply →"}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Nothing waiting. We&apos;ll email{coach.sms_opt_in_at && !coach.sms_opted_out ? " and text" : ""} you when a family requests you.</p>
        )}
      </section>

      {/* Availability */}
      <section className="card flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="font-semibold">{coach.paused ? "Paused — not accepting new requests" : "Accepting new requests"}</h2>
          <p className="text-sm text-muted">{coach.paused ? "Families see that you're taking a short break." : "Busy week? Pause anytime. Open requests aren't affected."}</p>
        </div>
        <form action={togglePause}><button className={coach.paused ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{coach.paused ? "Resume" : "Pause"}</button></form>
      </section>

      {/* Coach Line: saved camps & events → one-tap answers */}
      <section id="camps" className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Your camps &amp; events</h2>
          <p className="text-sm text-muted">Save them once. When a family asks, answering is one tap — and every answer pays you.</p>
          <p className="mt-1 break-all text-xs text-muted">Your Coach Line address: <strong className="text-navy">{coachLineAddress(coach)}</strong></p>
        </div>
        {(["camp", "event"] as const).map((w) => {
          const items = (w === "camp" ? coach.camps : coach.events) ?? [];
          return (
            <div key={w} className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-subtle">{w === "camp" ? "Camps" : "Events you'll attend"}</p>
              {items.map((it, i) => (
                <form key={i} action={saveItem} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <input type="hidden" name="which" value={w} /><input type="hidden" name="op" value="remove" /><input type="hidden" name="i" value={i} />
                  <span className="min-w-0"><span className="block truncate font-medium">{it.name}</span><span className="block text-xs text-muted">{[it.dates, it.location].filter(Boolean).join(" · ")}</span></span>
                  <button className="btn-ghost btn-sm shrink-0">Remove</button>
                </form>
              ))}
              <details className="rounded-xl bg-surface p-3">
                <summary className="cursor-pointer text-sm font-semibold text-blue">+ Add {w === "camp" ? "a camp" : "an event"}</summary>
                <form action={saveItem} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input type="hidden" name="which" value={w} />
                  <input name="name" placeholder={w === "camp" ? "Camp name" : "Event name"} className="field" aria-label="Name" />
                  <input name="dates" placeholder="Dates, e.g. June 14–15" className="field" aria-label="Dates" />
                  <input name="location" placeholder="Location (optional)" className="field" aria-label="Location" />
                  {w === "camp" && <input name="url" placeholder="https:// sign-up link (optional)" className="field" aria-label="Sign-up link" />}
                  <button className="btn-primary btn-sm sm:col-span-2">Save</button>
                </form>
              </details>
            </div>
          );
        })}
      </section>

      {/* Payouts (hidden while payments are off — nothing to pay out yet) */}
      {!paymentsOff() && <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Payouts</h2>
        {ready ? (
          <Notice tone="success" title="You're all set">Every delivered evaluation pays you automatically. Bank timing follows Stripe&apos;s payout schedule.</Notice>
        ) : coach.stripe_details_submitted ? (
          <Notice tone="warn" title="Stripe is verifying your details">Usually a few minutes. You&apos;ll be bookable as soon as Stripe finishes.</Notice>
        ) : (
          <p className="text-[15px] leading-relaxed text-muted">
            <strong className="text-navy">Required before families can book you.</strong> A one-time 3-minute setup with Stripe, our payments partner.
            Stripe verifies your identity and collects your bank details directly — we never see your bank login or account number.
          </p>
        )}
        <form action={continueToStripe}>
          <button className={ready ? "btn-ghost w-full" : "btn-primary w-full"}>{ready ? "Open my Stripe payouts dashboard" : coach.stripe_account_id ? "Continue Stripe setup" : "Set up payouts with Stripe (3 min)"}</button>
        </form>
      </section>}

      {/* Intro video */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Profile intro video</h2>
          <p className="text-sm text-muted">15–30 seconds on who you are and how you evaluate film. Profiles with a video get far more requests. It&apos;s shown publicly on your profile.</p>
        </div>
        {introSrc && <video src={introSrc} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black" />}
        <Recorder
          uploadUrlEndpoint={`/api/hub/${token}/intro-upload-url`}
          submitEndpoint={`/api/hub/${token}/intro-submit`}
          recordLabel={introSrc ? "● Record a new intro" : "● Record my intro"}
          submitLabel="Save intro video"
          target={[15, 30]}
          maxSeconds={60}
          prompts={["Your name + coaching background", "What you look for on film", "What families get from your evaluation"]}
          attestation={<>I agree this video will be shown publicly on my Athlete Market profile.</>}
          done={<p className="rounded-xl bg-success-50 p-4 text-center text-sm font-medium text-[#0b4f2a]">Saved! Refresh to see it on your profile.</p>}
        />
      </section>

      {/* Text alerts */}
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Text alerts</h2>
        {sms === "invalid" && <Notice tone="danger">Enter a valid US mobile number and tick the consent box.</Notice>}
        {coach.sms_opted_out ? (
          <p className="text-sm text-muted">You replied STOP, so we don&apos;t text you. To turn texts back on, text START to our number, then save your number below.</p>
        ) : coach.sms_opt_in_at && coach.phone ? (
          <form action={saveSms} className="flex items-center justify-between gap-3">
            <p className="text-sm">On — new requests are texted to <strong>{prettyPhone(coach.phone)}</strong>.</p>
            <input type="hidden" name="op" value="off" />
            <button className="btn-ghost btn-sm">Turn off</button>
          </form>
        ) : null}
        {!(coach.sms_opt_in_at && coach.phone && !coach.sms_opted_out) && (
          <form action={saveSms} className="space-y-3">
            <p className="text-sm text-muted">Get a text the moment a family requests you — the fastest way to never miss one.</p>
            <label htmlFor="phone" className="label">Mobile number</label>
            <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={coach.phone ? prettyPhone(coach.phone) : ""} placeholder="(555) 123-4567" className="field" />
            <label className="flex items-start gap-3 text-xs leading-relaxed text-muted">
              <input type="checkbox" name="consent" className="mt-0.5 h-5 w-5 shrink-0 accent-blue" />
              <span>{SMS_CONSENT}</span>
            </label>
            <button className="btn-navy w-full">Turn on text alerts</button>
          </form>
        )}
      </section>
    </div>
  );
}
