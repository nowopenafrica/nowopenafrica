/*
  # Allow platform enquiries from the /platform page

  The /platform page ("Put your business on it") lets visitors send a
  platform-level enquiry straight to the NowOpen team. Adds a third `kind`
  value to the platform_enquiries check constraint (the previous constraint
  only allowed `advert` and `media_service`).

  Safe to run on any deployment — the constraint is dropped and re-added.
*/

ALTER TABLE platform_enquiries DROP CONSTRAINT IF EXISTS platform_enquiries_kind;
ALTER TABLE platform_enquiries ADD CONSTRAINT platform_enquiries_kind
  CHECK (kind IN ('advert', 'media_service', 'platform'));
