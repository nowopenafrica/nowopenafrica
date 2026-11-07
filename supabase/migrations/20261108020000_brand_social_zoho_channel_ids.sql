-- Brand social: Zoho Social's own id for each channel.
--
-- Zoho Flow's "Draft post" action takes the channel as Zoho's internal channel
-- id. Its pick-list lookup fails for this account (Zoho answers
-- INVALID_OAUTHSCOPE even with full permissions, checked 2026-10-28), but the
-- field accepts ids directly, so the dispatcher sends the id with each post and
-- the flow needs no branch per channel.
--
-- Ids read from Zoho Social (GetBrandsInfo for brand 1727409000000023009) on
-- 2026-10-28, each matched to its network by where the profile picture is
-- hosted. Zoho listed one LinkedIn channel; it is mapped to the profile. The
-- company page stays NULL until its own id is confirmed, and a channel with no
-- id is refused by the dispatcher rather than guessed.

ALTER TABLE public.brand_social_channels ADD COLUMN IF NOT EXISTS zoho_channel_id text;

UPDATE public.brand_social_channels AS c SET zoho_channel_id = v.zid
FROM (VALUES
  ('facebook',         '1727409000000026015'),
  ('x',                '1727409000000026058'),
  ('instagram',        '1727409000000026077'),
  ('pinterest',        '1727409000000026139'),
  ('linkedin_profile', '1727409000000026187'),
  ('youtube',          '1727409000000026094'),
  ('tiktok',           '1727409000000026117'),
  ('whatsapp',         '1727409000000026138'),
  ('threads',          '1727409000000026120')
) AS v(id, zid)
WHERE c.id = v.id AND c.zoho_channel_id IS NULL;
