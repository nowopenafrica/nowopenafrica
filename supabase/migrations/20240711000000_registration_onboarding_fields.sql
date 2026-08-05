/*
  # Full onboarding fields for business_registrations

  Elaborates the Digital Forms registration into a complete onboarding
  record: operating details (hours, payment methods, service area,
  languages), a separate logo vs cover image, and optional verification
  details (registration number, tax ID, document link) that let the team
  fast-track a business's verified badge without blocking submission.

  All new columns are nullable — existing rows and the public INSERT
  policy from the original migration are unaffected.
*/

ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS year_established integer;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS employee_count text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS payment_methods text[];
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS service_area text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS languages text[];
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS business_hours jsonb;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS verification_doc_url text;
