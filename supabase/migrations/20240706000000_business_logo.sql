/*
  # Business profile photo (logo) separate from cover banner

  `image_url` is used as the wide cover/banner image on the business
  detail page. There was no column for the circular profile photo shown
  overlapping the banner — the detail page already reads `logo_url` for
  it, but the dashboard form had nowhere to write it. This adds the
  column so the two images can be uploaded and stored independently.
*/

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url text;
