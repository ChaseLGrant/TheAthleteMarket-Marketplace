# What is verified vs. not yet verified

Being explicit so nothing is assumed to work that hasn't been run against the real service.

## Verified in this repo

* **44 automated tests** (`npm test`) covering pricing, the compliance gate, token signing, validation, film embeds, and the full
  lifecycle against an in-memory database with simulated Stripe and email: duplicate webhooks, concurrent payouts (exactly one
  transfer), late submissions rejected after the deadline, expiry → single refund, decline → single refund, failed refund retried
  by cron, refund blocked after payout, dispute holds payout until won, opt-out refunds open requests, coach capacity, rate limits, and the card-hold model: coach never emailed without a successful
  hold, charge only on submit, declines/expiries cost $0 in fees, failed charge withholds the video and coach payout until
  retried, deadline clamped before the hold expires, already-lapsed holds close cleanly.
* **Production build** succeeds (Next.js 16, TypeScript strict).
* **End-to-end browser run** in demo mode (Chromium, iPhone 13 emulation, fake camera): search, directory-listing block,
  form validation, checkout, coach email link, in-browser recording, upload with progress, family playback, Stripe onboarding
  (simulated), decline → hold released, expiry → hold released, admin login and every admin page. No browser console errors.

## NOT yet verified (needs your credentials and real devices)

| Item | Why unverified | How to verify |
|---|---|---|
| Supabase queries + RLS + storage signed uploads | No Supabase project was connected | Deployment checklist §1, then smoke test |
| Stripe Checkout, refunds, Express onboarding, transfers with `source_transaction`, webhooks | No Stripe keys | Stripe test mode, smoke test §9 |
| Express accounts with only the `transfers` capability | Supported for US platforms, but confirm in your Stripe account | First test onboarding |
| Resend delivery + inbox placement | No API key or verified domain | Send the smoke-test emails to Gmail and Outlook |
| Recording on **real** iPhone Safari / Android Chrome | Only emulated Chromium was tested | Smoke test §9.4 on physical phones |
| Playback of WebM recordings on older iPhones | Recorder prefers MP4 (Safari, Chrome 126+ record MP4); some Android/Firefox browsers record WebM, which iOS before 17.4 may not play | If it appears in testing, add server-side transcoding (Mux or Cloudflare Stream) |
| Stripe manual capture + `capture_before` | Needs Stripe keys | Smoke test §9.3/§9.6/§9.7: payment goes Uncaptured → Succeeded or Canceled |
| Vercel daily cron | Needs deployment | Check Vercel → Cron Jobs after deploy |

## Known limitations / next steps

* Video verification is size + type + duration sanity checks (plus optional admin review), not content analysis.
* Uploads are a single PUT with retries, not resumable chunks. Fine for 60-second clips; switch to TUS resumable uploads if
  coaches routinely upload large camera-roll files on weak connections.
* Admin auth is one shared password with a signed 12-hour cookie, plus rate limiting. Move to per-person logins
  (e.g. Supabase Auth with an allowlist) once more than one or two people need access.
* Analytics are computed in memory from all requests, which is fine for thousands of rows. Move to SQL views before ~50k requests.
