# The Athlete Market — Coach Evaluation Marketplace

`marketplace.theathletemarket.com` — a standalone Next.js app where a family picks a verified evaluator, pays $30–$50,
and gets a private 30–60 second video evaluation of their athlete's film. No customer or coach accounts, no passwords, no app.

```
Parent:  landing page → pick any coach (or enter their email) → choose ✍️ written $20 · 🎙️ voice note $35 · 🎥 video $50
         → Stripe Checkout (card HOLD only)
Coach:   email arrives with the athlete, film, what they earn and a fill-in template
         → hits REPLY in their own inbox (or attaches a voice memo / taps Record for video)
App:     receives the reply at a private per-request address → checks it → charges the card
Parent:  gets the reply in their inbox ("Level: Strong D2…") + a text → can forward it, rate it, ask another coach
Coach:   paid via Stripe (80%). No reply in 5 days → hold released, parent offered another coach in one tap.
```

## Try it in 60 seconds (no credentials)

```bash
npm install
```

```bash
DEMO_MODE=1 npm run dev
```

Open http://localhost:3000. Demo mode uses an in-memory database and **simulated** Stripe, Resend and storage.
`/demo/inbox` shows every email the app sent (click the coach's link to record), and has buttons to fast-forward time and
run the cron job (reminders, expiry, refunds). Admin: http://localhost:3000/admin, password `demo-admin`.
Demo mode refuses to start on a Vercel production deployment.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm test` | 92 unit/integration tests for money + state logic (Vitest) |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build |

## Where things live

| Area | Path |
|---|---|
| Database schema (run in Supabase) | `supabase/migrations/0001_init.sql` |
| Request lifecycle: checkout, notify, submit, refunds, payouts | `src/lib/services/lifecycle.ts` |
| Hard compliance gate | `src/lib/compliance.ts` |
| Stripe webhook dispatch | `src/lib/services/webhooks.ts`, `src/app/api/stripe/webhook/route.ts` |
| Scheduled sweep (expiry, retries, reminders, retention) | `src/lib/services/cron.ts`, `vercel.json` |
| Stripe / Resend / Storage adapters | `src/lib/integrations-live.ts` |
| Emails | `src/lib/email/templates.ts` |
| Browser recorder | `src/components/recorder.tsx` |
| Coach magic-link page | `src/app/(private)/r/[token]/page.tsx` |
| Family video page | `src/app/(private)/v/[token]/page.tsx` |
| Admin | `src/app/admin/` |
| Metrics (GMV, CAC, margin, funnel) | `src/lib/services/analytics.ts` |

## How double payment / late payment is prevented

* Every state change is a single atomic `UPDATE … WHERE status IN (…) RETURNING` (compare-and-set). Only one caller can win a transition.
* Stripe webhooks are recorded in `stripe_events`; a processed event id is never applied twice.
* Payouts: request must be `completed`, payout claimed `pending→processing` atomically, existing transfer for the
  `transfer_group` is looked up before creating one, and Stripe idempotency key `transfer-<request id>` is used.
* Families are charged only on delivery: Checkout uses `capture_method=manual`; the card is captured when the coach submits.
  Declines/expiries cancel the hold (no Stripe fee). The coach deadline always ends ≥12 h before the card hold expires
  (`capture_before` from the card network), so a delivered video can always be charged. The coach is only emailed after
  Stripe confirms the hold succeeded, and coaches are only paid from captured money.
* Refunds claim `refund_status` atomically and set `payout_status=none` in the same update, so a refunded request can never be paid out.
* Submissions require `expires_at > now()` inside the same update; after the deadline the upload is deleted and nothing is paid.
* Coach decline is a POST button behind a confirmation page — email link scanners cannot decline requests.

## Docs

* [Deployment checklist, credentials, DNS](docs/DEPLOYMENT.md)
* [Compliance approvals & gate](docs/COMPLIANCE.md)
* [Plan to validate the first 100 paid evaluations](docs/VALIDATION_PLAN.md)
* [What is tested vs. not yet tested](docs/STATUS.md)
