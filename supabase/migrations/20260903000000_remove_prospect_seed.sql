/*
  # Remove the 500 synthetic prospect listings

  Founder decision, 3 September 2026. The prospect seed did its job — it let the
  claim engine, the Import Center, the Review Queue and the listability rules be
  built and exercised against realistic volume — and the platform now has all of
  that working. Keeping 500 fabricated businesses in the table past that point
  is carrying a liability for no remaining benefit.

  ## Checked before writing this

  Nothing else refers to them. Measured on live immediately before:

      synthetic_total     500
      synthetic_claimed     0
      synthetic_owned       0
      synthetic_public      0
      claims_against        0
      keeps_against         0
      reviews_against       0
      reports_against       0
      founding_against      0
      radar_rows            0
      import_rows           0

  So this deletes 500 rows and cascades to nothing.

  ## The guards are not decoration

  A prospect that somebody had claimed would no longer be a prospect — it would
  be a real owner's page that happens to have started life as a seed, and
  deleting it would destroy their work. The WHERE clause therefore requires
  unclaimed AND unowned, not just the data_status. Today that excludes nothing;
  it is here so a re-run months from now cannot do damage.

  ## Reversible

  scripts/build-seed-migration.mjs regenerates the seed from the original CSV,
  idempotent on external_id. The seed migration (20260831020000) stays in
  history rather than being deleted — history is a record of what happened, and
  on a fresh database the two run in timestamp order to the same end state.
*/

DELETE FROM public.businesses
 WHERE data_status = 'synthetic_unverified'
   AND claim_status <> 'claimed'
   AND user_id IS NULL;
