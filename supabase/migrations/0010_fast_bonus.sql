-- Fast-answer bonus (optional): lets you change it in Admin → Settings. Without this, the defaults ($5 within 24h) apply.
alter table marketplace.settings add column if not exists fast_bonus_cents int not null default 500 check (fast_bonus_cents between 0 and 100000);
alter table marketplace.settings add column if not exists fast_bonus_hours int not null default 24 check (fast_bonus_hours between 1 and 168);
notify pgrst, 'reload schema';
