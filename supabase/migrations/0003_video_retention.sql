-- Videos are deleted automatically N days after delivery (families are told to download them).
-- Athlete details follow the separate, longer retention_days setting.
alter table settings add column if not exists video_retention_days int not null default 30
  check (video_retention_days between 1 and 365);
alter table requests add column if not exists video_deleted_at timestamptz;
