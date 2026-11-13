-- Coach Line (Nov 2026): parents ask a school's staff (or a specific coach) a question; answered or free.
-- Escalates through the staff; answers relay both ways (email + SMS) with The Athlete Market in the middle.
set search_path to marketplace, extensions, public;

alter table requests drop constraint if exists requests_format_check;
alter table requests add constraint requests_format_check check (format in ('written', 'voice', 'video', 'ask'));

alter table requests add column if not exists target_school text;
alter table requests add column if not exists target_sport text;
alter table requests add column if not exists escalation_ids uuid[] not null default '{}';  -- staff chain, in order
alter table requests add column if not exists escalation_index int not null default 0;
alter table requests add column if not exists escalated_at timestamptz;
alter table requests add column if not exists answer_kind text;                    -- camp | event | film | update | level | personal
alter table requests add column if not exists answer_payload jsonb;
alter table requests add column if not exists order_id uuid;
alter table requests add column if not exists parent_notified_open_at timestamptz;
alter table requests alter column stripe_checkout_session_id drop not null;

-- Multi-school orders ("Ask 3 schools"): one checkout, one hold per school.
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_payment_method_id text,
  purchaser_email text not null,
  total_cents int not null,
  school_count int not null,
  status text not null default 'awaiting_payment',   -- awaiting_payment | authorized | cancelled
  created_at timestamptz not null default now()
);
alter table orders enable row level security;

-- Every relayed message after the first answer (parent ↔ coach), email or SMS.
create table if not exists thread_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references requests(id) on delete cascade,
  direction text not null check (direction in ('parent_to_coach', 'coach_to_parent')),
  channel text not null check (channel in ('email', 'sms', 'web')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists thread_messages_request on thread_messages (request_id, created_at);
alter table thread_messages enable row level security;

-- Coaches save camps / events once; one-tap answers fill them in.
alter table coaches add column if not exists camps jsonb not null default '[]'::jsonb;    -- [{name, dates, location, url}]
alter table coaches add column if not exists events jsonb not null default '[]'::jsonb;   -- [{name, dates, location}]
alter table coaches add column if not exists answers_count int not null default 0;
alter table coaches add column if not exists answer_hours_total numeric not null default 0;

alter table settings add column if not exists ask_prices jsonb not null default '{"1": 2000, "3": 4900, "5": 6900}'::jsonb;
alter table settings add column if not exists ask_coach_share_bps int not null default 5000 check (ask_coach_share_bps between 0 and 10000);
alter table settings add column if not exists escalate_after_hours int not null default 48 check (escalate_after_hours between 6 and 120);

grant all on all tables in schema marketplace to service_role;
grant all on all sequences in schema marketplace to service_role;

-- Gmail railway: parents email a school's Coach Line address from their own inbox.
-- First time → confirm link (pay once, card saved). After that → reply YES to send.
create table if not exists ask_drafts (
  id uuid primary key default gen_random_uuid(),
  from_email text not null,
  target_school text,
  target_sport text,
  coach_id uuid references coaches(id) on delete set null,
  subject text,
  message text not null,
  film_url text,
  status text not null default 'pending',  -- pending | sent | expired
  request_id uuid references requests(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table ask_drafts enable row level security;
alter table coaches add column if not exists line_slug text unique;  -- e.g. exampleu-basketball-m

-- Saved card for returning parents (Stripe customer + payment method), by email.
create table if not exists saved_payers (
  email text primary key,
  stripe_customer_id text not null,
  stripe_payment_method_id text not null,
  name text,
  phone text,
  athlete_name text,
  athlete_grad_year int,
  athlete_position text,
  athlete_sport text,
  updated_at timestamptz not null default now()
);
alter table saved_payers enable row level security;
grant all on all tables in schema marketplace to service_role;
