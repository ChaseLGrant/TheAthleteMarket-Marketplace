# Compliance: approvals needed and how the gate works

> This is an operating summary, not legal advice. Get a sports-law attorney to review the model, Terms, Privacy Policy
> and evaluator agreement **before taking live payments.**

## The core risk

Currently employed college coaches may be prohibited by their governing body (NCAA, NAIA, NJCAA, CCCAA) and by their
institution from receiving compensation tied to evaluating prospective student-athletes. Recruiting-contact, evaluation-period
and outside-income rules can apply regardless of who pays, and whether or not the platform takes a commission. Getting this wrong
could hurt the athlete's eligibility and the coach's job.

## What the software enforces (hard gate, `src/lib/compliance.ts`)

A coach can receive a paid request only if **all** are true. The check runs on the profile, form, checkout creation,
coach notification after payment (auto-refund if it fails), and again before payout:

1. Listing type is `participating` (directory listings can never be booked).
2. Identity is `verified` by an admin.
3. Eligibility is `approved`, with a written eligibility basis and an optional re-review date that auto-expires approval.
4. If the coach is `active_college`: the platform-wide setting **Allow active college coaches** is on (default **off**)
   **and** an institutional + governing-body authorization reference is recorded on the coach.
5. Not opted out of email; price is one of the configured tiers.

Payouts also require completed Stripe Connect identity verification and active transfers, and no open dispute.

## Pilot recommendation

Run the first 100 evaluations with **former college coaches and independent evaluators only** (setting stays off).

## Manual approvals and actions

| # | Item | Owner |
|---|---|---|
| 1 | Attorney review of the business model, Terms, Privacy, evaluator agreement | You + counsel |
| 2 | Written evaluator agreement (independent contractor, no recruiting promises, conduct, confidentiality of minors' data, tax via Stripe 1099) | Counsel |
| 3 | Per-coach identity verification (call or video call plus a public profile check) before setting `verified` | Admin |
| 4 | Per-coach eligibility basis, e.g. confirm no current college employment (LinkedIn, staff directories) and record it | Admin |
| 5 | Before ever enabling active coaches: a written interpretation from each relevant governing body plus each institution's compliance office approval, filed per coach | Counsel + coach |
| 6 | COPPA/children's privacy review: users under 13 are not served; under-18s need a parent or guardian (enforced in the form) | Counsel |
| 7 | State consumer-protection/auto-refund wording check; card-network rules for marketplaces (Stripe handles most of this) | Counsel |
| 8 | Directory listings: use only public information you may use, honor removal requests quickly, and keep the "not affiliated" labels | Admin |
| 9 | Sales-tax determination for digital services in your nexus states (consider Stripe Tax) | Accountant |
| 10 | Stripe Connect platform profile and acceptable-use approval for this business type | Stripe |

## Built-in privacy protections for minors

* A parent or guardian must be the purchaser for athletes under 18, with an explicit consent checkbox (timestamp stored).
* GPA, metrics and the note never go into email; they appear only on the coach's secure page.
* Videos are in a private bucket, served by short-lived signed URLs. Token pages are `noindex`, `no-store` and `no-referrer`.
* Automatic purge of the video and athlete details after `retention_days` (default 365).
* Delivery links can be revoked from admin. Delivery links are also revoked automatically on refund.
