-- The Athlete Market — Coach Evaluation Marketplace
-- Initial schema. Run in the Supabase SQL editor or with `supabase db push`.
--
-- Security model: the browser never talks to these tables. All reads/writes go
-- through Next.js server code using the service-role key. RLS is enabled with
-- NO policies, so the public anon key (if ever exposed) can read nothing.
--
-- Everything lives in its own `marketplace` schema so it can share a Supabase project
-- with the main site without touching any of its tables in `public`.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists marketplace;
set search_path to marketplace, extensions, public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type listing_type as enum ('directory', 'participating');
create type coach_kind as enum ('active_college', 'former_college', 'independent');
create type verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type eligibility_status as enum ('not_reviewed', 'pending_review', 'approved', 'denied', 'suspended');

create type request_status as enum (
  'awaiting_payment',  -- checkout session created, not paid
  'paid',              -- payment captured, coach not yet emailed
  'coach_notified',    -- invitation email sent
  'accepted',          -- coach tapped "Record my evaluation"
  'submitted',         -- video uploaded, awaiting verification
  'completed',         -- verified + delivered to family
  'declined',          -- coach declined (refund follows)
  'expired',           -- deadline passed (refund follows)
  'refunded',          -- money returned to purchaser
  'cancelled'          -- checkout abandoned/expired, never paid
);
create type payout_status as enum ('none', 'pending', 'blocked', 'processing', 'paid', 'failed', 'reversed');
create type refund_status as enum ('none', 'processing', 'succeeded', 'failed');

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table settings (
  id int primary key default 1 check (id = 1),
  price_tiers_cents int[] not null default '{3000,4000,5000}',
  commission_bps int not null default 0 check (commission_bps between 0 and 5000),
  deadline_days int not null default 7 check (deadline_days between 1 and 30),
  max_open_requests_per_coach int not null default 15,
  require_admin_review boolean not null default false,
  allow_active_college_coaches boolean not null default false,
  retention_days int not null default 365,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Coaches (both public directory listings and verified participating evaluators)
-- ---------------------------------------------------------------------------
create table coaches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  full_name text not null,
  title text,
  school text,
  sport text not null,
  division text,          -- NCAA D1 | NCAA D2 | NCAA D3 | NAIA | NJCAA | CCCAA | Independent
  conference text,
  state text,             -- 2-letter
  email text,
  photo_url text,
  bio text,
  credentials text,
  listing_type listing_type not null default 'directory',
  coach_kind coach_kind not null default 'independent',
  verification_status verification_status not null default 'unverified',
  eligibility_status eligibility_status not null default 'not_reviewed',
  eligibility_basis text,              -- e.g. "Former D1 assistant, no current institutional affiliation"
  authorization_reference text,        -- required for active college coaches: institution + governing body approval reference
  eligibility_reviewed_at timestamptz,
  eligibility_expires_at timestamptz,
  price_cents int,
  stripe_account_id text unique,
  stripe_payouts_enabled boolean not null default false,
  stripe_transfers_active boolean not null default false,
  stripe_details_submitted boolean not null default false,
  opted_out boolean not null default false,
  is_demo boolean not null default false,
  application_message text,
  search_text text generated always as (
    lower(coalesce(full_name,'') || ' ' || coalesce(school,'') || ' ' || coalesce(sport,'') || ' ' ||
          coalesce(division,'') || ' ' || coalesce(conference,'') || ' ' || coalesce(state,'') || ' ' || coalesce(title,''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coaches_search_trgm on coaches using gin (search_text gin_trgm_ops);
create index coaches_filters on coaches (sport, division, state);
create index coaches_listing on coaches (listing_type, eligibility_status);
create unique index coaches_email_participating on coaches (lower(email)) where listing_type = 'participating' and email is not null;

-- ---------------------------------------------------------------------------
-- Evaluation requests
-- ---------------------------------------------------------------------------
create table requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                    -- short human reference, e.g. TAM-7KQ2MX
  coach_id uuid not null references coaches(id),
  status request_status not null default 'awaiting_payment',
  payout_status payout_status not null default 'none',
  refund_status refund_status not null default 'none',

  -- athlete
  athlete_name text not null,
  sport text not null,
  position text not null,
  grad_year int not null,
  film_url text not null,
  athlete_email text,
  metrics text,
  gpa text,
  message text,
  athlete_is_minor boolean not null,

  -- purchaser (parent/guardian, or the adult athlete)
  purchaser_name text not null,
  purchaser_email text not null,
  purchaser_relationship text not null,        -- 'parent_guardian' | 'athlete_adult'
  guardian_consent_at timestamptz,             -- required when athlete_is_minor
  terms_accepted_at timestamptz not null,

  -- money (all in cents)
  currency text not null default 'usd',
  price_cents int not null check (price_cents > 0),
  platform_fee_cents int not null default 0 check (platform_fee_cents >= 0),
  coach_payout_cents int not null check (coach_payout_cents >= 0),
  stripe_fee_cents int,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  stripe_refund_id text,
  stripe_transfer_id text,
  stripe_dispute_id text,
  dispute_status text,
  payout_block_reason text,
  last_error text,

  -- secrets used to derive HMAC magic links (rotate to revoke)
  coach_link_nonce text not null default encode(gen_random_bytes(16), 'hex'),
  delivery_link_nonce text not null default encode(gen_random_bytes(16), 'hex'),

  -- lifecycle timestamps
  paid_at timestamptz,
  expires_at timestamptz,                      -- coach deadline (set at payment)
  coach_notified_at timestamptz,
  coach_viewed_at timestamptz,
  accepted_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  expired_at timestamptz,
  refunded_at timestamptz,
  paid_out_at timestamptz,
  coach_attested_at timestamptz,
  reminder_count int not null default 0,
  last_reminder_at timestamptz,
  onboarding_email_sent_at timestamptz,
  refund_attempts int not null default 0,
  payout_attempts int not null default 0,
  purged_at timestamptz,

  -- video
  video_path text,
  video_mime text,
  video_size_bytes bigint,
  video_duration_seconds numeric,
  video_view_count int not null default 0,

  utm_source text,
  utm_campaign text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_status on requests (status);
create index requests_coach on requests (coach_id, status);
create index requests_expiry on requests (expires_at) where status in ('paid','coach_notified','accepted');
create index requests_payout on requests (payout_status) where payout_status in ('pending','blocked','processing','failed');
create index requests_refund on requests (refund_status) where refund_status in ('processing','failed');
create index requests_purchaser on requests (lower(purchaser_email));

-- Append-only audit trail of every state change and side effect.
create table request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references requests(id) on delete cascade,
  type text not null,
  from_status text,
  to_status text,
  actor text not null default 'system',        -- system | stripe | coach | purchaser | admin | cron
  data jsonb,
  created_at timestamptz not null default now()
);
create index request_events_request on request_events (request_id, created_at);

-- Stripe webhook idempotency ledger.
create table stripe_events (
  id text primary key,                         -- evt_...
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create table email_log (
  id bigint generated always as identity primary key,
  request_id uuid references requests(id) on delete set null,
  coach_id uuid references coaches(id) on delete set null,
  to_email text not null,
  template text not null,
  subject text not null,
  provider_id text,
  status text not null,                        -- sent | failed | suppressed
  error text,
  created_at timestamptz not null default now()
);
create index email_log_request on email_log (request_id);

-- Coaches (or anyone) who asked never to be emailed again.
create table email_suppressions (
  email text primary key,                      -- stored lowercase
  reason text not null,
  created_at timestamptz not null default now()
);

create table disputes (
  id text primary key,                         -- dp_...
  request_id uuid references requests(id),
  amount_cents int not null,
  reason text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Families asking for a coach who isn't participating yet (demand signal).
create table waitlist (
  id bigint generated always as identity primary key,
  coach_id uuid not null references coaches(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (coach_id, email)
);

-- Funnel analytics (no PII).
create table analytics_events (
  id bigint generated always as identity primary key,
  name text not null,                          -- coach_view | form_view | checkout_started | ...
  coach_id uuid,
  request_id uuid,
  created_at timestamptz not null default now()
);
create index analytics_events_name_time on analytics_events (name, created_at);

-- Marketing spend for CAC.
create table marketing_spend (
  id bigint generated always as identity primary key,
  month date not null,                         -- first of month
  channel text not null,
  amount_cents int not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

-- Fixed-window rate limiter usable from serverless functions.
create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

create or replace function rate_limit_hit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
set search_path = marketplace, extensions, public
as $$
declare
  v_count int;
begin
  insert into rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.count + 1 end,
        window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

-- updated_at triggers
create or replace function touch_updated_at() returns trigger language plpgsql set search_path = marketplace as $$
begin new.updated_at = now(); return new; end; $$;
create trigger coaches_touch before update on coaches for each row execute function touch_updated_at();
create trigger requests_touch before update on requests for each row execute function touch_updated_at();
create trigger settings_touch before update on settings for each row execute function touch_updated_at();

-- Lock everything down: service role bypasses RLS; anon/authenticated get nothing.
alter table settings enable row level security;
alter table coaches enable row level security;
alter table requests enable row level security;
alter table request_events enable row level security;
alter table stripe_events enable row level security;
alter table email_log enable row level security;
alter table email_suppressions enable row level security;
alter table disputes enable row level security;
alter table waitlist enable row level security;
alter table analytics_events enable row level security;
alter table marketing_spend enable row level security;
alter table rate_limits enable row level security;
revoke execute on function rate_limit_hit(text, int, int) from public, anon, authenticated;

-- Only the server (service_role) may use this schema. The public/browser roles get nothing.
revoke all on schema marketplace from public, anon, authenticated;
grant usage on schema marketplace to service_role;
grant all on all tables in schema marketplace to service_role;
grant all on all sequences in schema marketplace to service_role;
grant execute on all functions in schema marketplace to service_role;
alter default privileges in schema marketplace grant all on tables to service_role;
alter default privileges in schema marketplace grant all on sequences to service_role;
alter default privileges in schema marketplace grant execute on functions to service_role;

-- Private video bucket (no public access; served via short-lived signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-videos', 'marketplace-videos', false, 524288000,
        array['video/mp4','video/webm','video/quicktime','video/x-m4v','video/3gpp'])
on conflict (id) do nothing;
