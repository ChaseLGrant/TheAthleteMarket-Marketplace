# Deployment checklist

Estimated time: ~2 hours of setup, plus Stripe and Resend verification wait times. Do everything in **test mode** first.

## 0. Accounts you need

| Service | Purpose | Cost to start |
|---|---|---|
| GitHub | Code (this repo) | Free |
| Vercel | Hosting, daily cron job, SSL | **Free (Hobby) works.** The cron runs once a day |
| Supabase | Postgres + private video storage | You already have Pro (daily backups, large uploads) |
| Stripe | Checkout, refunds, Connect payouts | Pay-as-you-go |
| Resend | Email to coaches + families | Free tier is capped at 100 emails/day — **use Resend Pro ($20/mo, 50k emails)** before launch, Scale beyond that |
| Postmark | Receives coaches' email replies | ~$15/mo (inbound included) |
| Twilio | Text alerts to coaches (+ order alerts to you) | ~$0.01 per text; you already have an approved account |

## 1. Supabase (inside your existing project — no extra cost)

The marketplace lives in its **own `marketplace` schema** and its own **`marketplace-videos`** storage bucket inside the
Supabase project you already pay for. Your main site's tables (in `public`) are not touched. A separate project would add
~$10/month of compute, so we don't create one.

1. Open your existing project → **SQL Editor → New query** → paste all of `supabase/setup.sql` → **Run**.
   You should see "Setup complete ✅". (It creates 12 tables, locks them so only the server can read them, and creates the
   private `marketplace-videos` bucket with a 500 MB file limit.)
2. **Project Settings → Data API → Exposed schemas:** add `marketplace` → Save. (Required so the app's server can reach the tables.
   The public/browser roles still get "permission denied" — only the secret server key works.) If "Enable Data API" is off, turn it on.
3. **Storage → Settings:** make sure the global upload size limit is at least 500 MB.
   Storage stays small: each video (~20 MB) is deleted automatically 30 days after delivery (configurable in Admin → Settings),
   so at steady state you only hold about one month of videos — roughly 2 GB at 100 evaluations/month.
4. **Project Settings → API Keys:** copy the Project URL → `NEXT_PUBLIC_SUPABASE_URL`, and the secret `service_role` key →
   `SUPABASE_SERVICE_ROLE_KEY`. Never put the service role key in a `NEXT_PUBLIC_` variable or share it in chat.
5. Keep `SUPABASE_DB_SCHEMA=marketplace` and `SUPABASE_VIDEO_BUCKET=marketplace-videos` (these are also the defaults).

To see the data later: **Table Editor → schema dropdown (top-left) → `marketplace`**.

## 2. Stripe

1. **Settings → Business:** set business name "The Athlete Market", support email, statement descriptor (e.g. `ATHLETEMARKET`).
2. **Connect → Get started:** choose *Marketplace*, accounts **Express**, platform is responsible for fees and losses.
   Complete the Connect platform profile. Set branding (logo, navy `#0B1B3F`, blue `#1F5FFF`).
3. **Developers → API keys:** copy the secret key → `STRIPE_SECRET_KEY`.
4. **Developers → Webhooks → Add endpoint** — create **two** endpoints with the same URL
   `https://marketplace.theathletemarket.com/api/stripe/webhook`:
   * **"Events on your account"**: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
     `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `transfer.reversed`
     → signing secret → `STRIPE_WEBHOOK_SECRET`
   * **"Events on connected accounts"**: `account.updated`, `payout.failed`
     → signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`
5. **Settings → Payment methods:** cards + Apple Pay + Google Pay only. Leave ACH/bank debits, Klarna, Afterpay, Cash App etc.
   **off** — the app places a card *hold* and charges on delivery, which only card-type methods support.
6. **Radar → Rules** (fraud / wrong-card protection): make sure "Block if CVC verification fails" and "Block if postal code
   verification fails" are **enabled**. Combined with the hold, a card that's wrong, declined or has insufficient funds is
   rejected at checkout and the coach is never emailed.
7. Apple Pay: **Settings → Payment method domains** → add `marketplace.theathletemarket.com`.
8. Bank deposit timing for coaches follows each connected account's Stripe payout schedule (US default is usually 2 business days
   after funds are available). Because transfers use `source_transaction`, a transfer waits until the original charge's funds are available.

**Local webhook testing:**

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook --forward-connect-to localhost:3000/api/stripe/webhook
```

## 3. Resend

1. **Domains → Add domain:** use a subdomain such as `mail.theathletemarket.com` so the marketplace can't affect the main site's email reputation.
2. Add the SPF, DKIM (and optional DMARC) DNS records Resend shows you at your DNS provider; wait for "Verified".
3. Create an API key (sending access only) → `RESEND_API_KEY`.
4. `EMAIL_FROM="The Athlete Market <evaluations@mail.theathletemarket.com>"`, `EMAIL_REPLY_TO=` a real monitored inbox.
5. Set `COMPANY_POSTAL_ADDRESS` to a real mailing address (CAN-SPAM).

## 3a. Email at high volume (thousands per day)

Coach emails are the growth engine, so inbox placement matters more than anything else.

1. **Send from a subdomain** (`mail.theathletemarket.com`) with SPF, DKIM and a DMARC record (`v=DMARC1; p=none; rua=mailto:you@…`),
   so problems never affect the main domain's email.
2. **Bounce & spam-complaint webhook:** Resend → Webhooks → add `https://marketplace.theathletemarket.com/api/resend/webhook`
   for `email.bounced` and `email.complained`; put its signing secret in `RESEND_WEBHOOK_SECRET`. The app then never emails
   that address again, marks the coach unreachable, releases waiting families immediately (not charged) and offers them another coach.
3. **Warm up the domain.** New sending domains that jump to thousands of cold emails a day land in spam. Ramp roughly:
   week 1 ≈ 50/day → week 2 ≈ 150/day → week 3 ≈ 400/day → week 4 ≈ 1,000/day → then double weekly while bounce rate stays
   under 2% and complaints under 0.1% (watch Resend → Metrics).
4. **Already built in:** one email per coach (new requests batch behind an unopened one; follow-ups combine into
   "N families waiting — $X"), one-click unsubscribe headers, automatic retry when Resend rate-limits a burst.
5. **Import clean lists.** Only import coach emails you got from public staff/team pages; remove role addresses
   (`info@`, `athletics@`) and obviously stale entries — bounces are what hurt reputation most.

## 3a-2. Inbound email: coaches reply from their own inbox (Postmark)

Every request gets a private reply address like `r-<id>-<code>@reply.theathletemarket.com`. When a coach hits Reply, the email
goes to Postmark, which posts it to the app. The app cleans the reply, checks it's a real answer (auto-replies "almost there" if
not), charges the card, emails the reply to the family and pays the coach. Coaches and families never see each other's addresses.

1. Create a Postmark account → **Servers → your server → Inbound**. (Inbound is included on paid plans, from ~$15/mo.)
2. **DNS:** add an **MX** record for `reply.theathletemarket.com` → `inbound.postmarkapp.com` (priority 10). Only this subdomain;
   your main email is untouched.
3. In Postmark Inbound settings: **Inbound domain** = `reply.theathletemarket.com`, **Webhook URL** =
   `https://marketplace.theathletemarket.com/api/inbound/postmark?token=YOUR_INBOUND_WEBHOOK_SECRET`.
   Turn on "Include raw email content" off (not needed). Postmark retries automatically if the app is briefly unavailable.
4. Vercel env: `INBOUND_EMAIL_DOMAIN=reply.theathletemarket.com`, `INBOUND_WEBHOOK_SECRET=` (random, same as in the URL).
5. Test: place a $20 test-mode order to yourself as the coach, hit Reply in your real inbox, fill in the template, send —
   the "family" inbox should receive the reply within a minute.

Attachment limits: voice memos (about 1 MB per minute) always fit. Videos larger than ~25 MB get turned into Drive/iCloud links
by the coach's mail app — those links are accepted too, and the email also offers a one-tap "Record" page.

## 3b. Twilio (text alerts)

1. Twilio Console → **Messaging → Services**: use the Messaging Service attached to your approved A2P 10DLC campaign.
   Copy its SID (starts with `MG`) → `TWILIO_MESSAGING_SERVICE_SID`.
2. **Account → API keys & tokens**: copy the Account SID (`AC…`) → `TWILIO_ACCOUNT_SID` and the Auth Token → `TWILIO_AUTH_TOKEN`
   (paste these only into Vercel, never into chat).
3. `ADMIN_ALERT_PHONE` = your own mobile (+1…) — you'll be texted for every new order, every video awaiting review, and low ratings.
4. Keep Twilio's default opt-out handling **on** (Messaging Service → Opt-out management). STOP replies are honored by Twilio,
   and the app marks that coach as opted out the next time it tries to text them.
5. Your A2P campaign description should match what we send: "Transactional alerts to opted-in coaches about new evaluation requests
   and deadlines." Opt-in happens on the coach application form or the coach hub (checkbox with STOP/HELP wording); the privacy
   policy states mobile numbers are never shared for marketing.

If Twilio isn't configured, the app simply skips texts and uses email only.

## 4. Vercel

1. **Add New → Project →** import this GitHub repo as a **new, separate project** (e.g. `tam-marketplace`).
   This does not touch your existing theathletemarket.com project.
2. Framework: Next.js (auto-detected). No build settings to change.
3. **Settings → Environment Variables** (Production + Preview): everything in `.env.example`. Generate secrets with:

```bash
openssl rand -base64 48
```

   Use a different value for each of `APP_SECRET`, `CRON_SECRET`, and `ADMIN_PASSWORD`. Do **not** set `DEMO_MODE`.
4. Deploy. Check `https://<project>.vercel.app/api/health` — every `configured` flag should be `true` and `db` should be `ok`.
5. Background sweep: **run it every 10 minutes from Supabase** (free): edit `supabase/cron.sql` (your `CRON_SECRET`) and
   run it in the SQL Editor. `vercel.json` also runs it once a day as a backup. Each run is time-boxed (~50s) and safe to
   overlap, so it keeps up at high volume on the free Vercel plan.
   Previously: `vercel.json` runs `/api/cron` once a day (14:00 UTC; Hobby may run it any time within that hour). Vercel sends
   `Authorization: Bearer $CRON_SECRET` automatically. What runs immediately vs. daily:
   * **Immediate** (no cron needed): checkout, coach email, coach decline → hold released, video submit → charge → delivery → payout,
     and rejecting submissions after the deadline.
   * **Daily**: releasing holds for coaches who never responded (up to ~24 h after the deadline — the family was never charged,
     they just see the pending hold slightly longer), reminders, retries of anything that failed, data retention.

## 5. Domain: marketplace.theathletemarket.com

1. Vercel → the **new** project → **Settings → Domains → Add** `marketplace.theathletemarket.com`.
   Vercel shows the exact CNAME target to use (usually `cname.vercel-dns.com`, sometimes a project-specific `…vercel-dns-0xx.com` value — use what Vercel shows).
2. Find who runs your DNS: run `nslookup -type=NS theathletemarket.com`, or look it up at whois.com.
   The nameservers tell you where to add the record (e.g. `ns1.vercel-dns.com` = Vercel, `*.domaincontrol.com` = GoDaddy,
   `*.registrar-servers.com` = Namecheap, `*.ns.cloudflare.com` = Cloudflare, `ns-cloud-*.googledomains.com` = Squarespace/Google).
3. Add **one** record. Change nothing else; your apex `@` and `www` records stay exactly as they are, so the main site is untouched.

| Provider | Where | Type | Name/Host | Value/Target | TTL |
|---|---|---|---|---|---|
| **Vercel DNS** (main site already on Vercel nameservers) | Nothing to do: adding the domain in step 1 creates the record automatically | — | — | — | — |
| **GoDaddy** | My Products → Domain → DNS → Add | CNAME | `marketplace` | `cname.vercel-dns.com` | 1 hour |
| **Namecheap** | Domain List → Manage → Advanced DNS → Add new record | CNAME Record | `marketplace` | `cname.vercel-dns.com.` | Automatic |
| **Cloudflare** | DNS → Records → Add record | CNAME | `marketplace` | `cname.vercel-dns.com` | Auto — **Proxy status: DNS only (grey cloud)** |
| **Squarespace / Google Domains** | Domains → DNS → Custom records | CNAME | `marketplace` | `cname.vercel-dns.com` | 1 hr |
| **Wix** | Domains → Manage DNS records → CNAME → Add | CNAME | `marketplace` | `cname.vercel-dns.com` | 1 hour |

4. Wait for Vercel to show **Valid Configuration** (minutes; up to 48 h). Vercel then issues the SSL certificate automatically. No action needed.
5. If the domain has a `CAA` record, make sure it allows `letsencrypt.org`, or SSL won't be issued.

## 6. Production URLs

* `NEXT_PUBLIC_SITE_URL=https://marketplace.theathletemarket.com` — used for Stripe success/cancel redirects, every email link,
  canonical URLs, sitemap and Open Graph. Redeploy after changing it.
* Preview deployments: set `NEXT_PUBLIC_SITE_URL` in the *Preview* environment to your staging URL, and use Stripe **test** keys there.

## 7. Add "Marketplace" to the main site navigation

The main site is a separate app; only its menu changes. Add a link to `https://marketplace.theathletemarket.com` labelled
**"Coach Evaluations"** (or "Marketplace"). Examples:

* **Next.js/React main site:**

```tsx
<a href="https://marketplace.theathletemarket.com?utm_source=main_site&utm_campaign=nav">Coach Evaluations</a>
```

* **Webflow / Squarespace / Wix / WordPress:** Navigation/Menu editor → add *External link* → the URL above → publish.

The `utm_source` is stored on each request, so the admin dashboard can attribute sales to the main site.

## 8. SEO

Already built in: per-page titles/descriptions, canonical URLs, `/sitemap.xml` (verified coaches only), `/robots.txt`
(private token pages, admin and API blocked), `noindex` + `no-referrer` on magic-link pages, FAQ structured data,
generated Open Graph image. After launch: add the property in Google Search Console and submit the sitemap.

## 9. Go-live smoke test (test mode, then live mode with a $30 real card + refund)

1. `/api/health` all green.
2. Create a coach in admin with *your* email, verified + approved, $30.
3. Request an evaluation with card `4242 4242 4242 4242` → in Stripe the payment shows **Uncaptured**; receipt + coach email arrive.
   Also try `4000 0000 0000 0002` (declined) → checkout refuses it and no coach email is sent.
4. Open the coach link on an **iPhone (Safari)** and an **Android (Chrome)**: record, retake, submit. Also try "Upload a video instead".
5. Family email → video plays on iPhone, Android and desktop.
6. After submitting, the Stripe payment changes to **Succeeded** (captured). Payout setup email → complete Stripe Express onboarding (test mode: use Stripe's test SSN `000-00-0000` and test bank) → transfer appears in Stripe.
7. Second request → Decline → the Stripe payment shows **Canceled** (no fee) + "You weren't charged" email.
8. Third request → in Supabase set `expires_at` to the past → call `/api/cron` with the bearer secret → hold released.
9. Coach hub (link in the coach's email): turn on text alerts with your phone → place another test order → you get a text.
   Tap "Film won't open?" on the coach page → the family email has a fix link → paste a new link → the coach is re-notified.
10. After delivery: rate the video, then tap "Get a second coach's take" → details are pre-filled.
11. Stripe Dashboard → trigger a test dispute (card `4000 0000 0000 0259`) → admin alert + payout held.
12. Then switch keys to live mode, create live webhook endpoints, and repeat steps 3–7 once with a real card.

## 10. Monitoring

* Uptime: point an uptime monitor (Better Stack, UptimeRobot) at `/api/health`.
* Alerts: failed refunds/payouts, disputes, failed delivery emails and new applications are emailed to `ADMIN_ALERT_EMAIL`.
* Logs: structured JSON in Vercel → Logs (search `"level":"error"`). Optionally add a log drain or Sentry.
* Weekly: Admin → Money, and compare "Expected platform balance" against Stripe's balance report.

## Credentials summary

| Variable | From |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe → Developers → Webhooks (two endpoints) |
| `RESEND_API_KEY` | Resend → API Keys |
| `APP_SECRET`, `CRON_SECRET`, `ADMIN_PASSWORD` | Generate yourself (see above) |
| `EMAIL_FROM`, `EMAIL_REPLY_TO`, `ADMIN_ALERT_EMAIL`, `COMPANY_POSTAL_ADDRESS` | Your choices |
