-- Email-native evaluations (Nov 2026): parents pay on one page; coaches reply from their own inbox.
-- Formats: written ($20), voice memo ($35), video ($50). Each request gets its own reply-to address.
set search_path to marketplace, extensions, public;

alter table requests add column if not exists format text not null default 'video'
  check (format in ('written', 'voice', 'video'));
alter table requests add column if not exists level_read text;          -- "What level do you see me at?"
alter table requests add column if not exists response_text text;       -- the coach's written reply (cleaned)
alter table requests add column if not exists response_kind text;       -- written | voice | video | link
alter table requests add column if not exists response_link text;       -- e.g. coach replied with a video link
alter table requests add column if not exists response_from text;       -- address the coach replied from
alter table requests add column if not exists purchaser_phone text;
alter table requests add column if not exists purchaser_sms_opt_in_at timestamptz;

alter table settings add column if not exists format_prices jsonb not null
  default '{"written": 2000, "voice": 3500, "video": 5000}'::jsonb;

-- Every inbound reply is recorded once (idempotent webhook processing + audit trail).
create table if not exists inbound_messages (
  id text primary key,                 -- provider message id
  request_id uuid references requests(id) on delete set null,
  from_email text,
  outcome text not null,               -- accepted | too_short | needs_media | declined | closed | unknown_address | duplicate
  received_at timestamptz not null default now()
);
alter table inbound_messages enable row level security;
grant all on inbound_messages to service_role;

-- Voice memos are stored next to videos.
update storage.buckets
  set allowed_mime_types = array['video/mp4','video/webm','video/quicktime','video/x-m4v','video/3gpp',
                                 'audio/mp4','audio/x-m4a','audio/m4a','audio/mpeg','audio/aac','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/amr','audio/3gpp']
  where id = 'marketplace-videos';
