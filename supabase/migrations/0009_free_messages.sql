-- Allow $0 messages (Coach Line with payments off). Negative prices are still rejected.
set search_path = marketplace, public;
alter table marketplace.requests drop constraint if exists requests_price_cents_check;
alter table marketplace.requests add constraint requests_price_cents_check check (price_cents >= 0);

-- Databases set up before saved_payers.athlete_film_url existed.
alter table marketplace.saved_payers add column if not exists athlete_film_url text;
notify pgrst, 'reload schema';
