-- Authorize at checkout, capture only on delivery.
-- Declines/expiries release the card hold instead of refunding, so no Stripe fee is lost.
set search_path to marketplace, extensions, public;
alter table requests add column if not exists payment_captured_at timestamptz;
alter table requests add column if not exists authorization_expires_at timestamptz;

-- Card holds last ~5–7 days depending on brand, so the coach deadline defaults to 5 days.
alter table settings alter column deadline_days set default 5;
update settings set deadline_days = 5 where deadline_days > 5;
alter table settings drop constraint if exists settings_deadline_days_check;
alter table settings add constraint settings_deadline_days_check check (deadline_days between 1 and 6);
