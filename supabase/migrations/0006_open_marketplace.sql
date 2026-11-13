-- Open marketplace (owner decision, Nov 2026): families can request ANY coach — no admin approval.
--  * Directory coaches and coaches a family adds are emailed the request; payment motivates a response.
--  * Self-signups go live once they confirm their email (by opening their coach hub link).
--  * Identity is verified by Stripe before any payout; a name mismatch holds the payout for review.
set search_path to marketplace, extensions, public;

alter table coaches add column if not exists email_confirmed_at timestamptz;
alter table coaches add column if not exists source text not null default 'import';   -- import | self | family | admin
alter table coaches add column if not exists unlisted boolean not null default false;  -- family-added: direct link only
alter table coaches add column if not exists removed boolean not null default false;   -- takedown request / admin removal
alter table coaches add column if not exists stripe_legal_name text;
alter table coaches add column if not exists name_match_override boolean not null default false;
alter table coaches add column if not exists requests_received int not null default 0;

alter table settings alter column require_payouts_before_booking set default false;
alter table settings alter column show_directory_listings set default true;
alter table settings alter column require_admin_review set default false;
update settings set require_payouts_before_booking = false, show_directory_listings = true, require_admin_review = false;

-- Pricing (owner decision): one $50 price, 20% platform commission → coach $40, platform $10 (minus Stripe's fee).
alter table settings alter column price_tiers_cents set default '{5000}';
alter table settings alter column commission_bps set default 2000;
update settings set price_tiers_cents = '{5000}', commission_bps = 2000;

-- High volume: track undeliverable coach addresses (from Resend bounce / complaint webhooks).
alter table coaches add column if not exists email_status text not null default 'ok';  -- ok | bounced | complained
create index if not exists requests_coach_open on requests (coach_id) where status in ('paid','coach_notified','accepted');
