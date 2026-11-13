-- Experience upgrades: coach SMS, coach hub (pause, intro video), payout setup before booking,
-- film-link fix flow, written takeaways, family ratings, second opinions, weekly earnings.
set search_path to marketplace, extensions, public;

alter table coaches add column if not exists phone text;                       -- E.164, e.g. +15551234567
alter table coaches add column if not exists sms_opt_in_at timestamptz;        -- explicit consent to texts
alter table coaches add column if not exists sms_opted_out boolean not null default false; -- replied STOP
alter table coaches add column if not exists paused boolean not null default false;
alter table coaches add column if not exists intro_video_path text;
alter table coaches add column if not exists delivered_count int not null default 0;
alter table coaches add column if not exists delivery_hours_total numeric not null default 0;
alter table coaches add column if not exists rating_sum int not null default 0;
alter table coaches add column if not exists rating_count int not null default 0;
alter table coaches add column if not exists payout_invite_sent_at timestamptz;
alter table coaches add column if not exists last_summary_at timestamptz;

alter table requests add column if not exists takeaway_strength text;
alter table requests add column if not exists takeaway_improve text;
alter table requests add column if not exists takeaway_next text;
alter table requests add column if not exists rating int check (rating between 1 and 5);
alter table requests add column if not exists would_buy_again boolean;
alter table requests add column if not exists rating_comment text;
alter table requests add column if not exists rated_at timestamptz;
alter table requests add column if not exists film_issue_at timestamptz;
alter table requests add column if not exists film_issue_note text;
alter table requests add column if not exists parent_request_id uuid references requests(id);

alter table settings add column if not exists show_directory_listings boolean not null default false;
alter table settings add column if not exists require_payouts_before_booking boolean not null default true;
alter table settings alter column require_admin_review set default true;
update settings set require_admin_review = true;  -- review the first ~20 videos; turn off in Admin → Settings

-- Messages (email + SMS) get an optional unique dedupe key so retries never double-send a text.
alter table email_log add column if not exists channel text not null default 'email';
alter table email_log add column if not exists dedupe_key text;
create unique index if not exists email_log_dedupe on email_log (dedupe_key) where dedupe_key is not null;

grant all on all tables in schema marketplace to service_role;
