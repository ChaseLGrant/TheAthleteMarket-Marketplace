# Go live: step by step (no coding needed)

> **Payments off for now.** Until you add a Stripe key, Coach Line runs **free**: there's no card step, nothing is charged,
> and coaches aren't promised money. Everything else works: messages, one-tap answers, texts, passing to the next coach,
> and replies. **Skip A2 and A6** for now. When you're ready to charge, follow "Turn on payments" at the bottom.

Two phases:

* **Phase A, test run (about 45 minutes).** The real site runs on its own web address with **fake payments**. Every email and text
  goes to **you**, and you play both the parent and the coach.
* **Phase B, real launch.** Your own domain, real payments, real coaches.

> 🔒 **Keys and passwords go only into Vercel's settings page**, never into a chat, email or document.
> Have a notes app open and paste each key into it as you go. You'll copy them all into Vercel in step A5.

---

## Phase A: the test run

### A1. Supabase (database): 5 minutes
1. Open your existing Supabase project → **SQL Editor → New query**.
2. Pick one:
   * **Never ran our setup before:** paste the whole file `supabase/setup.sql` → **Run**.
   * **Already ran `setup.sql` earlier:** paste only `supabase/migrations/0008_coach_line.sql` → **Run**.
3. **Project Settings → Data API → Exposed schemas:** add `marketplace` → **Save**.
4. **Project Settings → API Keys:** copy the **Project URL** and the secret **service_role** key into your notes.

### A2. Stripe (payments) in TEST mode: 10 minutes
1. In the Stripe dashboard, turn on the **Test mode** switch (top right).
2. **Connect → Get started** → *Marketplace* → **Express** accounts. (Coaches use this to get paid. You can finish the details later.)
3. **Developers → API keys:** copy the **Secret key** (starts with `sk_test_`).
4. Leave this tab open. You'll add the webhook in step A6 once you have your web address.

### A3. Resend (email): 5 minutes
1. Sign up at resend.com **using the same email you want to test with** (for example, your Gmail).
2. **API Keys → Create API key** (Full access) → copy it (starts with `re_`).
3. For the test run you don't need a domain. Resend's test sender can email **your own address only**, which is exactly
   what test mode does.

### A4. Make two long random passwords
You need these for `APP_SECRET` and `CRON_SECRET`.
Use any password generator to make **two random strings, 40+ characters each**.
Then pick an admin password for yourself (`ADMIN_PASSWORD`).

### A5. Vercel (puts the site online): 10 minutes
1. Go to vercel.com → **Sign up with GitHub**.
2. **Add New → Project** → choose **theathletemarket-marketplace** → **Import**.
3. Open **Environment Variables** and add each of these:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL (A1) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (A1) |
| `PAYMENTS_OFF` | `1` (free mode, so no Stripe needed yet) |
| `RESEND_API_KEY` | `re_…` (A3) |
| `EMAIL_FROM` | `Coach Line <onboarding@resend.dev>` |
| `APP_SECRET` | random string #1 (A4) |
| `CRON_SECRET` | random string #2 (A4) |
| `ADMIN_PASSWORD` | your admin password |
| `ADMIN_ALERT_EMAIL` | your email |
| **`TEST_INBOX`** | **your email (the one you signed up to Resend with)** |
| `TEST_PHONE` | your mobile, e.g. `+15551234567` (only if Twilio is added) |
| `COMPANY_POSTAL_ADDRESS` | your business mailing address (shown at the bottom of emails) |

4. Click **Deploy**. When it finishes, copy your web address (something like `https://theathletemarket-marketplace.vercel.app`).
5. **Settings → Environment Variables:** add `NEXT_PUBLIC_SITE_URL` = that address. Then **Deployments → ⋯ → Redeploy**.

*(Optional) Texts:* add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` and `TEST_PHONE`, then redeploy.

### A6. Connect Stripe to the site: 3 minutes
1. Stripe (still in Test mode) → **Developers → Webhooks → Add endpoint**.
2. URL: `https://YOUR-ADDRESS/api/stripe/webhook`
3. Events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`,
   `charge.dispute.closed`, `transfer.reversed`.
4. Copy the **Signing secret** (`whsec_…`) → Vercel → `STRIPE_WEBHOOK_SECRET` → **Redeploy**.

### A7. Check everything: 1 minute
Go to `https://YOUR-ADDRESS/admin` → sign in → **🚀 Launch**. Every line should be ✅ or 🟡, with no ❌.
The yellow box should say **"Test mode is ON."**

### A8. Test it as both people: 5 minutes
1. On the **Launch** page, fill in **"Test it as the coach"** (your name and email) → **Create my test school**.
2. On your phone, open your site → type **Test University** → pick it → **Write my message**.
3. Fill it in **as the parent**, using your own email, and tap **Send**. With payments off there's no card step.
4. Check your Gmail. You'll get:
   * **Parent emails**, like "Sent!"
   * **The coach email**, starting `[TEST → …] … asked about Athlete Market Test University`. That one is your coach view.
5. In the coach email, tap **Invite to camp** → **Send answer**.
6. Check Gmail again for **"Coach … answered Taylor 🎉"**. That's the parent's view of the answer.

That's the full loop. Try the other buttons too, like "Better fit elsewhere" and "Pass it on".

---

## Phase B: the real launch

Do these in order. The 🚀 **Launch** page in your admin shows which ones are done.

1. **Your domain:** Vercel → **Settings → Domains** → add `marketplace.theathletemarket.com` → add the DNS record it shows
   at your domain provider. Update `NEXT_PUBLIC_SITE_URL` to `https://marketplace.theathletemarket.com`.
2. **Email from your own domain:** Resend → **Domains** → add `theathletemarket.com` → add the DNS records → wait for "Verified".
   Then set `EMAIL_FROM` = `Coach Line <line@theathletemarket.com>`.
3. **Email replies and the Gmail option:** set up Postmark inbound (docs/DEPLOYMENT.md §3a-2), then add `INBOUND_EMAIL_DOMAIN`
   and `INBOUND_WEBHOOK_SECRET`.
4. **Timed jobs** (reminders, passing to the next coach, releasing unanswered holds): run `supabase/cron.sql` in Supabase
   (it has instructions at the top).
5. **Real payments:** Stripe → turn **off** Test mode → copy the live `sk_live_…` key → `STRIPE_SECRET_KEY`. Repeat step A6
   in live mode for a new `STRIPE_WEBHOOK_SECRET`. Finish Stripe's Connect profile.
6. **Turn off test mode:** delete `TEST_INBOX` and `TEST_PHONE` in Vercel → **Redeploy**.
7. In admin → **🚀 Launch** → **Hide test school**.
8. **One real $20 test:** message a school with your own real card, answer it from the coach email, then refund yourself
   in Stripe. If that works, you're live.

---

## Turn on payments (when you're ready for the paywall)

1. Do **A2** (Stripe in Test mode) and **A6** (webhook).
2. In Vercel: add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, **delete `PAYMENTS_OFF`**, then **Redeploy**.
3. Check **Admin → 🚀 Launch**: "Payments (Stripe)" should say **TEST mode**.
4. Test once with card `4242 4242 4242 4242`. Prices come from **Admin → Settings** ($20 / $49 / $69, with the coach getting 50%).
5. When that works, switch Stripe to live keys (Phase B, step 5).

Coaches who answered during the free period get their first paid message with the "$10 for answering" line automatically.
