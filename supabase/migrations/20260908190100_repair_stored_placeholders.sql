-- Repair the 342 placeholder values already stored.
--
-- Separate from 20260908190000 on purpose. That migration added the guard and
-- changed no existing row; this one rewrites production data, which is a
-- decision rather than a side effect of adding a guard. Read the header there
-- for what was measured and why it matters.
--
-- WHAT CHANGES
--
--   businesses.whatsapp   'UNKNOWN' → NULL   (257 rows)
--   businesses.website    'UNKNOWN' → NULL   (85 rows)
--   businesses.email      ''        → NULL   (1 row)
--   radar_candidates      the same fields, so the next publish does not
--                         re-create what this removes
--
-- NO INFORMATION IS LOST. Every value removed says "we do not know", which is
-- what NULL says — and says it in a form the rest of the system can read.
-- Nothing is deleted and no row disappears.
--
-- WHAT IT WILL LOOK LIKE AFTERWARDS
--
-- 195 businesses lose the 25 points `listing_score` was awarding them for a
-- contact nobody can use, and 26 of those fall below the 40-point
-- indexability bar and become `noindex`. That is a REDUCTION in indexed
-- pages, and the right direction: a profile with no way to contact the
-- business is the thin page that costs a directory its credibility. The
-- listings themselves stay visible on NowOpen — only the instruction to
-- search engines changes.
--
-- IDEMPOTENT by construction: it writes only rows the scrub would change, and
-- after it has run there are none. Safe to re-run.

update public.businesses
   set phone         = public.blank_if_placeholder(phone),
       whatsapp      = public.blank_if_placeholder(whatsapp),
       email         = public.blank_if_placeholder(email),
       website       = public.blank_if_placeholder(website),
       address       = public.blank_if_placeholder(address),
       description   = public.blank_if_placeholder(description),
       about         = public.blank_if_placeholder(about),
       opening_hours = public.blank_if_placeholder(opening_hours),
       hours         = public.blank_if_placeholder(hours),
       image_url     = public.blank_if_placeholder(image_url),
       logo_url      = public.blank_if_placeholder(logo_url)
 where phone         is distinct from public.blank_if_placeholder(phone)
    or whatsapp      is distinct from public.blank_if_placeholder(whatsapp)
    or email         is distinct from public.blank_if_placeholder(email)
    or website       is distinct from public.blank_if_placeholder(website)
    or address       is distinct from public.blank_if_placeholder(address)
    or description   is distinct from public.blank_if_placeholder(description)
    or about         is distinct from public.blank_if_placeholder(about)
    or opening_hours is distinct from public.blank_if_placeholder(opening_hours)
    or hours         is distinct from public.blank_if_placeholder(hours)
    or image_url     is distinct from public.blank_if_placeholder(image_url)
    or logo_url      is distinct from public.blank_if_placeholder(logo_url);

update public.radar_candidates
   set phone    = public.blank_if_placeholder(phone),
       whatsapp = public.blank_if_placeholder(whatsapp),
       email    = public.blank_if_placeholder(email),
       website  = public.blank_if_placeholder(website),
       address  = public.blank_if_placeholder(address)
 where phone    is distinct from public.blank_if_placeholder(phone)
    or whatsapp is distinct from public.blank_if_placeholder(whatsapp)
    or email    is distinct from public.blank_if_placeholder(email)
    or website  is distinct from public.blank_if_placeholder(website)
    or address  is distinct from public.blank_if_placeholder(address);
