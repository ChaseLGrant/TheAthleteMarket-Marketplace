set search_path to marketplace, extensions, public;
-- OPTIONAL staging data. Fictional people and schools only. DO NOT run on production.
insert into coaches (slug, full_name, title, school, sport, division, conference, state, email, coach_kind,
  listing_type, verification_status, eligibility_status, eligibility_basis, price_cents, credentials, bio, is_demo)
values
 ('test-evaluator', 'Test Evaluator', 'Former Head Coach', 'Demo State (former)', 'Basketball (M)', 'NCAA D2', 'Demo Conference', 'OH',
  'you+coach@yourdomain.com', 'former_college', 'participating', 'verified', 'approved',
  'Staging test account — not a real coach', 3000, 'Staging only', 'Use this coach to test the full flow with Stripe test mode.', true),
 ('demo-directory-listing', 'Directory Example', 'Head Coach', 'Example Demo University', 'Soccer (W)', 'NCAA D1', 'Demo Conference', 'TX',
  null, 'active_college', 'directory', 'unverified', 'not_reviewed', null, null, null, null, true);
