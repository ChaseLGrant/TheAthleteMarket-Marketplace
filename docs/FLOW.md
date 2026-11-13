# How it works — customer to coach fulfillment

Three people are involved: the **parent** (customer), the **coach**, and **you** (The Athlete Market, always in the middle).
The parent uses one web page. The coach never needs a website at all — just their email.

## 1. The parent orders (≈2 minutes, one website)
1. Lands on marketplace.theathletemarket.com — "Ask any college coach what level they see you at."
2. Finds a coach by search, or types in **any** coach's name + email if they aren't listed.
3. Picks a reply type: ✍️ **Written take $20** · 🎙️ **Voice note $35** · 🎥 **Video breakdown $50**.
4. Fills in the athlete (name, sport, position, grad year, film link) and their own name + email
   (+ optional mobile number for texts). Parent/guardian consent if the athlete is under 18.
5. Pays with Stripe (card, Apple Pay, Google Pay). **The card is only held, not charged.**
6. Done with the website. They immediately get:
   - 📧 a receipt email ("request sent — card held, charged only if the coach replies")
   - 💬 a text (if they gave a number)

## 2. The coach gets the request (no account, no app, no password)
7. 💬 Text (if the coach has turned texts on): "$16 for a written take — Taylor Brooks, PG, 2028. Check your email."
8. 📧 Email from The Athlete Market with the athlete, film link, what they earn (80%), the deadline (5 days) and a
   fill-in template:
   ```
   Level I see you at (D1 / D2 / D3 / NAIA / JUCO / Not yet):
   Top strength:
   What to work on:
   Next step:
   ```
   The email's Reply-To is a **private Athlete Market address made for this one request** — never the parent's email.
9. Coach's options:
   - **Written:** tap "Reply now" (or just Reply) → fill in the template → Send. ~2 minutes.
   - **Voice note:** Reply and attach a voice memo from their phone (Voice Memos → Share → Mail).
   - **Video:** tap "Record" (60 seconds in the browser, no login) — or reply with a video or link.
   - **Not interested:** reply **PASS** (or tap "decline") → the parent is never charged.
   - **On a computer without a mail app:** "type your reply on the request page" link.
10. If the coach hasn't answered: automatic follow-ups (day 1 if unopened, ~3 days left, final day). A coach with several
    families waiting gets **one** combined email ("3 families are waiting — $48"), not one per request.

## 3. Behind the scenes (≈2 seconds after the coach hits Send)
11. The reply arrives at the private address (via Postmark → the app).
12. The app removes quoted email history/signatures and checks it's a real answer.
    Too short or missing the voice memo → the coach gets an automatic "almost there" email; nothing is charged yet.
13. **The parent's card is charged** (only now).
14. The reply is forwarded to the parent **from The Athlete Market**.
15. **The coach is paid 80%** through Stripe Connect. (First time only: a 3-minute Stripe setup — Stripe verifies identity
    and collects bank details; you never see them. If Stripe's verified name doesn't match the coach profile, that payout is
    held for your review.)

## 4. The parent receives the reply
16. 💬 Text: "Jordan Ellis replied about Taylor! Check your email."
17. 📧 Email: the level read up top ("Strong D2, fringe D1"), then the coach's words (and a play button for a voice note
    or video). It's theirs to keep and forward — with a footer that brings new families to the site.
18. One tap opens a private reply page: the reply, download (voice/video kept 30 days), ⭐ rating, and
    **"Ask another coach"** (all their details pre-filled) — the repeat purchase.

## 5. If the coach never replies
19. After 5 days the hold is released automatically — **the parent is never charged** — and they get an email + text:
    "Jordan couldn't reply in time — you were NOT charged. Pick another coach (details saved)."
20. Same if the coach replies PASS, unsubscribes, or their email bounces.

## 6. You, the middle man
- Coach and parent never see each other's email or phone. Every message goes through The Athlete Market.
- Every request, reply (exact text, voice note, video), payment, email and text is recorded in Admin → Requests.
- Optional: "Review every reply before delivery" (Admin → Settings) — you approve each reply before the parent sees it.
- You get texts for each new order, replies awaiting review and low ratings.

## The money (per completed request)
| Reply type | Parent pays | Coach gets (80%) | You get (20%) | You keep after Stripe's fee |
|---|---|---|---|---|
| ✍️ Written take | $20 | $16 | $4 | ≈ $3.12 |
| 🎙️ Voice note | $35 | $28 | $7 | ≈ $5.68 |
| 🎥 Video | $50 | $40 | $10 | ≈ $8.25 |
No reply → $0 charged, $0 in fees.
