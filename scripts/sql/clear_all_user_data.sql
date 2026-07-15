/*
  # Clear all user data (MANUAL SCRIPT — not a migration)

  Run this by hand from the Supabase SQL editor when you want to wipe
  user-generated content. It was moved out of supabase/migrations so it
  can never be applied as part of a normal migration run.

  Notes:
  - Does NOT delete auth.users (do that from the Supabase Dashboard)
  - Safe to run multiple times
*/

DELETE FROM businesses;
DELETE FROM advertisements;
DELETE FROM media_services;
DELETE FROM users;
