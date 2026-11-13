# Compliance: owner's decision and what the product does

> **Owner decision (Nov 2026):** the marketplace is open to **all** coaches — college head coaches, assistants and graduate
> assistants, former coaches, independent evaluators and professional players. The owner handles governing-body, institutional
> and legal compliance outside the product. The software does **not** check NCAA/NAIA/NJCAA/CCCAA rules or recruiting calendars.
>
> This document is an operating summary, not legal advice.

## What the product still does (none of it blocks a qualified coach)

| Safeguard | Why it stays |
|---|---|
| One-click admin **Approve** per coach | Confirms the person is real — stops impostors taking families' money |
| Stripe identity verification before payouts | Required by Stripe / financial regulations (KYC) |
| Parent/guardian consent checkbox for athletes under 18 | Children's privacy law, independent of athletics rules |
| "Feedback only — not a recruiting offer" wording | Protects you from claims that a scholarship or spot was promised |
| One evaluator-terms checkbox on the coach application | Coaches agree to give honest feedback and make no recruiting promises |
| Admin → Settings switch for current college coaches (on by default) | An emergency off-switch only; nothing is blocked while it's on |

## Risks the owner has accepted (for the record)

* Governing-body rules and institutions can restrict current college staff (including assistants and graduate assistants)
  from being paid to evaluate prospects, which could affect a coach's job and, in some cases, a prospect's eligibility.
* Professional players may have team/league contract limits on paid side work.
* Team and league names/logos are trademarks — list a player's team factually, but don't use logos or imply endorsement in marketing.

## Privacy protections for minors (built in)

* A parent or guardian must place requests for athletes under 18 (consent timestamp stored).
* GPA, metrics and the note never go into email; they appear only on the coach's secure page.
* Private video storage with short-lived signed links; videos auto-deleted 30 days after delivery.
* Token pages are `noindex`, `no-store` and `no-referrer`; delivery links can be revoked.
