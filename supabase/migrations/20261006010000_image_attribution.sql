-- Attribution for images we did not take.
--
-- The website backfill takes a picture from the business's own site, where the
-- business is the one publishing it. Wikimedia Commons is different: the
-- photographs are somebody else's work, released under CC BY-SA, CC BY or a
-- public-domain dedication — and most of those licences REQUIRE the author and
-- licence to travel with the image.
--
-- Without somewhere to put that, using Commons would mean either breaching the
-- licence or not using it at all. This is the somewhere.
--
-- `image_attribution` holds the rendered credit ("Photo: A. Name, CC BY-SA
-- 4.0"); `image_licence` holds the bare licence code so a later audit can ask
-- "show me everything under a share-alike licence" without parsing prose.

alter table public.businesses
  add column if not exists image_attribution text,
  add column if not exists image_licence text,
  add column if not exists logo_attribution text,
  add column if not exists logo_licence text;

comment on column public.businesses.image_attribution is
  'Credit line that must be displayed wherever image_url is shown, when its licence requires it.';

/*
 * A stock photograph is licensed to us and needs no credit; a Commons
 * photograph usually does. So the rule is not "every image needs attribution"
 * — it is that an image taken from a third party must not claim to need none.
 */
comment on column public.businesses.image_licence is
  'Licence code for image_url (e.g. CC BY-SA 4.0). Null for stock and for a business''s own website image.';
