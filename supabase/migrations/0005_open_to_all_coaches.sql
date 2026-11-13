-- Owner decision (Nov 2026): open the marketplace to all coaches, including current college assistants
-- and graduate assistants. Coaches self-attest that accepting payment complies with the rules that apply
-- to them (on application and on every submission). Admin still verifies identity before approval.
set search_path to marketplace, extensions, public;
alter table settings alter column allow_active_college_coaches set default true;
update settings set allow_active_college_coaches = true;
alter table coaches add column if not exists self_attested_at timestamptz;

-- Professional / former professional players as evaluators (e.g. pro or barnstorming baseball).
alter type coach_kind add value if not exists 'pro_player';
