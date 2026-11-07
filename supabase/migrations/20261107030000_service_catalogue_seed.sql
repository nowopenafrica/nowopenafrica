/*
  # The launch catalogue — seeded as PROPOSED, not as prices anyone agreed to

  ## Why not one of these rows is orderable

  The brief that specified this catalogue says so itself, twice:

    "The pricing below is a proposed launch catalogue in Nigerian naira (₦),
     not verified market averages or existing NowOpen Africa rates."

    "These bundles are launch hypotheses. Before publishing them as firm
     commercial commitments, verify production costs, provider payouts,
     revision workload and expected margin."

  So every row below seeds with price_basis = 'proposed' and
  quote_required = true. They are browsable, searchable and configurable —
  and `is_orderable` computes to false for all of them, so no checkout can
  take money against a figure nobody has stood behind.

  Turning one on is a one-field change an admin can make without an engineer:

    UPDATE public.services
       SET price_basis = 'quoted', quote_required = false
     WHERE sku = 'ds-business-card';

  That is the entire point of moving the catalogue out of TypeScript. The
  gate is the price's PROVENANCE, not its publication.

  ## Where the physical prices differ

  The print production rows are marked 'indicative' rather than 'proposed'
  because the brief cites published Nigerian printers as the reference. They
  are still not orderable, for the same reason: a benchmark is what somebody
  else charges, not what our supplier will.

  ## Re-runnable

  Every insert is ON CONFLICT (sku) DO UPDATE on the descriptive fields only.
  It deliberately does NOT reset price_basis or quote_required, so re-running
  this file cannot switch a service that has since been properly quoted back
  into a hypothesis.
*/

-- ─────────────────────────────────────────────────────────────────────────
-- Categories
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.service_categories (slug, name, summary, icon, sort_order, published) VALUES
  ('design-studio',        'Design Studio',                  'Editable designs and one-off digital artwork.',            'sparkles', 10, true),
  ('branding-identity',    'Branding & Identity',            'Logos, identity systems and brand guidelines.',            'package',  20, true),
  ('print-packaging',      'Print & Packaging',              'Artwork for things that get printed, wrapped or worn.',    'printer',  30, true),
  ('marketing-campaigns',  'Marketing & Campaigns',          'Content packs, campaign creative and advertising.',        'megaphone', 40, true),
  ('video-motion',         'Video, Motion & Animation',      'Short edits through to animation and brand films.',        'video',    50, true),
  ('business-digital',     'Business & Digital Assets',      'Profiles, decks, portfolios and interface design.',        'briefcase', 60, true),
  ('creative-services',    'Creative Services & Production', 'Direction, photography, production and post.',             'clapperboard', 70, true),
  ('print-production',     'Print Production',               'Physically printed and delivered goods.',                  'boxes',    80, true),
  ('bundles',              'Packages',                       'Curated bundles for businesses starting out.',             'layers',   90, true)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, summary = EXCLUDED.summary,
      icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, published = EXCLUDED.published;

-- ─────────────────────────────────────────────────────────────────────────
-- Services
--
-- Prices are given in WHOLE NAIRA here, because that is how the brief states
-- them and a seed file nobody can read against its source is a seed file that
-- drifts. The × 100 to minor units happens once, below.
-- ─────────────────────────────────────────────────────────────────────────

WITH seed (sku, slug, name, category_slug, deliverable_type, fulfilment, pricing_model,
           price_naira, price_unit, t_min, t_max, sort_order) AS (VALUES

  -- ── 01 Design Studio ────────────────────────────────────────────────
  ('ds-social-graphic',    'social-media-graphic',     'Basic social media graphic',      'design-studio', 'digital', 'creator', 'starting_at',   3500, NULL, 1, 3, 10),
  ('ds-flyer',             'flyer-design',             'Promotional flyer',               'design-studio', 'digital', 'creator', 'starting_at',   7500, NULL, 2, 4, 20),
  ('ds-event-flyer',       'event-flyer-design',       'Event flyer',                     'design-studio', 'digital', 'creator', 'starting_at',   7500, NULL, 2, 4, 30),
  ('ds-poster',            'poster-design',            'Poster design',                   'design-studio', 'digital', 'creator', 'starting_at',   8500, NULL, 2, 4, 40),
  ('ds-invitation',        'digital-invitation',       'Digital invitation',              'design-studio', 'digital', 'creator', 'starting_at',   7500, NULL, 2, 4, 50),
  ('ds-business-card',     'business-card-design',     'Business card design',            'design-studio', 'digital', 'creator', 'starting_at',   7500, NULL, 2, 4, 60),
  ('ds-letterhead',        'letterhead-design',        'Letterhead design',               'design-studio', 'digital', 'creator', 'starting_at',   5000, NULL, 1, 3, 70),
  ('ds-email-signature',   'email-signature',          'Email signature',                 'design-studio', 'digital', 'creator', 'starting_at',   5000, NULL, 1, 3, 80),
  ('ds-price-list',        'price-list-design',        'Price list / rate card',          'design-studio', 'digital', 'creator', 'starting_at',  10000, NULL, 2, 5, 90),
  ('ds-menu',              'restaurant-menu-design',   'Restaurant menu design',          'design-studio', 'digital', 'creator', 'starting_at',  12500, NULL, 3, 6, 100),
  ('ds-brochure',          'brochure-design',          'Brochure design',                 'design-studio', 'digital', 'creator', 'starting_at',  15000, NULL, 3, 7, 110),
  ('ds-presentation-cover','presentation-cover',       'Presentation cover',              'design-studio', 'digital', 'creator', 'starting_at',   5000, NULL, 1, 3, 120),
  ('ds-presentation',      'presentation-slides',      'Presentation slides, up to 10',   'design-studio', 'digital', 'creator', 'starting_at',  25000, 'up to 10 slides', 3, 7, 130),
  ('ds-company-profile',   'company-profile-8',        'Company profile, up to 8 pages',  'design-studio', 'digital', 'creator', 'starting_at',  35000, 'up to 8 pages', 5, 10, 140),
  ('ds-certificate',       'certificate-design',       'Certificate design',              'design-studio', 'digital', 'creator', 'starting_at',   5000, NULL, 1, 3, 150),
  ('ds-cv',                'cv-resume-layout',         'CV / résumé layout',              'design-studio', 'digital', 'creator', 'starting_at',   7500, NULL, 2, 4, 160),
  ('ds-product-catalogue', 'product-catalogue-8',      'Product catalogue, up to 8 pages','design-studio', 'digital', 'creator', 'starting_at',  30000, 'up to 8 pages', 4, 8, 170),
  ('ds-whatsapp-catalogue','whatsapp-catalogue',       'WhatsApp catalogue graphics',     'design-studio', 'digital', 'creator', 'starting_at',  12500, NULL, 2, 5, 180),
  ('ds-digital-ad',        'digital-ad-creative',      'Digital ad creative',             'design-studio', 'digital', 'creator', 'starting_at',   7500, NULL, 2, 4, 190),
  ('ds-infographic',       'infographic-design',       'Infographic',                     'design-studio', 'digital', 'creator', 'starting_at',  12500, NULL, 3, 6, 200),
  ('ds-thumbnail',         'youtube-thumbnail',        'YouTube thumbnail',               'design-studio', 'digital', 'creator', 'starting_at',   5000, NULL, 1, 2, 210),
  ('ds-podcast-cover',     'podcast-cover-artwork',    'Podcast cover artwork',           'design-studio', 'digital', 'creator', 'starting_at',  10000, NULL, 2, 5, 220),
  ('ds-event-programme',   'event-programme-layout',   'Event programme layout',          'design-studio', 'digital', 'creator', 'starting_at',  15000, NULL, 3, 7, 230),
  ('ds-invitation-set',    'invitation-card-set',      'Invitation card set',             'design-studio', 'digital', 'creator', 'starting_at',  12500, NULL, 3, 6, 240),

  -- ── 02 Branding & Identity ──────────────────────────────────────────
  ('br-logo-refresh',      'logo-refresh',             'Logo refresh',                      'branding-identity', 'digital',  'creator', 'starting_at',  20000, NULL, 3, 7, 10),
  ('br-logo-starter',      'starter-logo-design',      'Starter logo design',               'branding-identity', 'digital',  'creator', 'starting_at',  35000, NULL, 4, 10, 20),
  ('br-logo-pro',          'professional-logo-package','Professional logo package',         'branding-identity', 'digital',  'creator', 'starting_at',  75000, NULL, 7, 14, 30),
  ('br-logo-suite',        'logo-suite',               'Logo suite with alternate versions','branding-identity', 'digital',  'creator', 'starting_at', 100000, NULL, 7, 14, 40),
  ('br-colour-type',       'brand-colour-typography',  'Brand colour and typography system','branding-identity', 'digital',  'creator', 'starting_at',  25000, NULL, 3, 7, 50),
  ('br-mini-kit',          'mini-brand-identity-kit',  'Mini brand identity kit',           'branding-identity', 'digital',  'creator', 'starting_at',  75000, NULL, 7, 14, 60),
  ('br-identity',          'complete-brand-identity',  'Complete brand identity',           'branding-identity', 'digital',  'creator', 'starting_at', 175000, NULL, 14, 28, 70),
  ('br-guidelines',        'brand-guidelines',         'Brand guidelines document',         'branding-identity', 'digital',  'creator', 'starting_at',  75000, NULL, 7, 14, 80),
  ('br-stationery',        'business-stationery-suite','Business stationery suite',         'branding-identity', 'digital',  'creator', 'starting_at',  35000, NULL, 4, 8, 90),
  ('br-social-kit',        'social-media-brand-kit',   'Social media brand kit',            'branding-identity', 'digital',  'creator', 'starting_at',  45000, NULL, 5, 10, 100),
  ('br-workshop',          'brand-strategy-workshop',  'Brand strategy workshop',           'branding-identity', 'strategy', 'creator', 'starting_at',  75000, NULL, 5, 14, 110),
  ('br-positioning',       'brand-positioning',        'Brand positioning and messaging',   'branding-identity', 'strategy', 'creator', 'starting_at', 100000, NULL, 10, 21, 120),
  ('br-strategy-identity', 'brand-strategy-identity',  'Full brand strategy and identity',  'branding-identity', 'strategy', 'creator', 'starting_at', 350000, NULL, 21, 42, 130),
  ('br-rebrand',           'rebranding-project',       'Rebranding project',                'branding-identity', 'strategy', 'creator', 'starting_at', 250000, NULL, 21, 42, 140),
  ('br-packaging-identity','packaging-identity-system','Packaging identity system',         'branding-identity', 'digital',  'creator', 'starting_at', 150000, NULL, 14, 28, 150),
  ('br-rollout',           'brand-rollout',            'Brand implementation / rollout',    'branding-identity', 'managed',  'creator', 'starting_at', 100000, NULL, 14, 30, 160),

  -- ── 03 Print & Packaging (ARTWORK ONLY — production is separate) ─────
  ('pk-card-artwork',      'business-card-artwork',    'Business card artwork',        'print-packaging', 'digital', 'creator', 'starting_at',  7500, NULL, 2, 4, 10),
  ('pk-flyer-artwork',     'flyer-artwork',            'Flyer artwork',                'print-packaging', 'digital', 'creator', 'starting_at',  7500, NULL, 2, 4, 20),
  ('pk-poster-artwork',    'poster-artwork',           'Poster artwork',               'print-packaging', 'digital', 'creator', 'starting_at',  8500, NULL, 2, 4, 30),
  ('pk-letterhead-artwork','letterhead-artwork',       'Letterhead artwork',           'print-packaging', 'digital', 'creator', 'starting_at',  5000, NULL, 1, 3, 40),
  ('pk-brochure-artwork',  'brochure-artwork',         'Brochure artwork',             'print-packaging', 'digital', 'creator', 'starting_at', 15000, NULL, 3, 7, 50),
  ('pk-menu-artwork',      'menu-artwork',             'Menu artwork',                 'print-packaging', 'digital', 'creator', 'starting_at', 12500, NULL, 3, 6, 60),
  ('pk-sticker-artwork',   'sticker-label-artwork',    'Sticker / label artwork',      'print-packaging', 'digital', 'creator', 'starting_at', 10000, NULL, 2, 5, 70),
  ('pk-label-system',      'product-label-system',     'Product label system',         'print-packaging', 'digital', 'creator', 'starting_at', 25000, NULL, 5, 10, 80),
  ('pk-paper-bag',         'paper-bag-design',         'Paper bag design',             'print-packaging', 'digital', 'creator', 'starting_at', 15000, NULL, 4, 8, 90),
  ('pk-sleeve',            'packaging-sleeve-design',  'Packaging sleeve design',      'print-packaging', 'digital', 'creator', 'starting_at', 20000, NULL, 4, 8, 100),
  ('pk-box',               'product-box-design',       'Product box design',           'print-packaging', 'digital', 'creator', 'starting_at', 35000, NULL, 7, 14, 110),
  ('pk-pouch',             'pouch-packaging-design',   'Pouch packaging design',       'print-packaging', 'digital', 'creator', 'starting_at', 25000, NULL, 5, 10, 120),
  ('pk-hangtag',           'clothing-tag-design',      'Clothing tag / hangtag design','print-packaging', 'digital', 'creator', 'starting_at', 10000, NULL, 2, 5, 130),
  ('pk-tshirt-graphic',    't-shirt-graphic',          'T-shirt graphic',              'print-packaging', 'digital', 'creator', 'starting_at', 10000, NULL, 2, 5, 140),
  ('pk-rollup-artwork',    'roll-up-banner-artwork',   'Roll-up banner artwork',       'print-packaging', 'digital', 'creator', 'starting_at', 12500, NULL, 2, 5, 150),
  ('pk-signage-artwork',   'shop-signage-artwork',     'Shop signage artwork',         'print-packaging', 'digital', 'creator', 'starting_at', 20000, NULL, 4, 8, 160),
  ('pk-vehicle-artwork',   'vehicle-branding-artwork', 'Vehicle branding artwork',     'print-packaging', 'digital', 'creator', 'starting_at', 35000, NULL, 5, 12, 170),
  ('pk-backdrop-artwork',  'event-backdrop-artwork',   'Event backdrop artwork',       'print-packaging', 'digital', 'creator', 'starting_at', 20000, NULL, 3, 7, 180),
  ('pk-print-ready',       'print-ready-preparation',  'Print-ready file preparation', 'print-packaging', 'digital', 'creator', 'starting_at',  5000, NULL, 1, 2, 190),

  -- ── 04 Marketing & Campaigns ────────────────────────────────────────
  ('mk-calendar',          'monthly-content-calendar', 'Monthly content calendar',             'marketing-campaigns', 'strategy', 'creator', 'starting_at',  15000, NULL, 3, 7, 10),
  ('mk-pack-5',            'social-content-pack-5',    'Social media content pack — 5 designs','marketing-campaigns', 'digital',  'creator', 'starting_at',  25000, '5 designs', 3, 7, 20),
  ('mk-pack-10',           'social-content-pack-10',   'Social media content pack — 10 designs','marketing-campaigns','digital',  'creator', 'starting_at',  45000, '10 designs', 5, 10, 30),
  ('mk-pack-20',           'social-content-pack-20',   'Social media content pack — 20 designs','marketing-campaigns','digital',  'creator', 'starting_at',  85000, '20 designs', 7, 14, 40),
  ('mk-concept',           'campaign-concept',         'Campaign concept development',         'marketing-campaigns', 'strategy', 'creator', 'starting_at',  50000, NULL, 7, 14, 50),
  ('mk-visual-direction',  'campaign-visual-direction','Campaign visual direction',            'marketing-campaigns', 'strategy', 'creator', 'starting_at',  75000, NULL, 7, 14, 60),
  ('mk-launch-pack',       'product-launch-pack',      'Product launch creative pack',         'marketing-campaigns', 'digital',  'creator', 'starting_at',  75000, NULL, 10, 21, 70),
  ('mk-awareness-pack',    'brand-awareness-pack',     'Brand awareness creative pack',        'marketing-campaigns', 'digital',  'creator', 'starting_at',  75000, NULL, 10, 21, 80),
  ('mk-promo-kit',         'promotional-campaign-kit', 'Promotional campaign kit',             'marketing-campaigns', 'digital',  'creator', 'starting_at', 100000, NULL, 10, 21, 90),
  ('mk-integrated',        'integrated-campaign',      'Integrated campaign creative',         'marketing-campaigns', 'managed',  'creator', 'starting_at', 250000, NULL, 21, 45, 100),
  ('mk-adaptation',        'creative-adaptation',      'Advertising creative adaptation',      'marketing-campaigns', 'digital',  'creator', 'per_item',      5000, 'per adaptation', 1, 3, 110),
  ('mk-ads-setup',         'paid-ad-account-setup',    'Paid ad account setup',                'marketing-campaigns', 'managed',  'creator', 'starting_at',  35000, NULL, 2, 5, 120),
  ('mk-ads-management',    'paid-campaign-management', 'Paid campaign management',             'marketing-campaigns', 'managed',  'creator', 'subscription', 75000, 'per month', 0, 0, 130),
  ('mk-influencer',        'influencer-coordination',  'Influencer campaign coordination',     'marketing-campaigns', 'managed',  'creator', 'starting_at',  50000, NULL, 7, 21, 140),
  ('mk-strategy-session',  'marketing-strategy-session','Marketing strategy session',          'marketing-campaigns', 'strategy', 'creator', 'starting_at',  35000, NULL, 2, 7, 150),
  ('mk-monthly-support',   'monthly-marketing-support','Monthly marketing support',            'marketing-campaigns', 'managed',  'creator', 'subscription', 150000, 'per month', 0, 0, 160),

  -- ── 05 Video, Motion & Animation ────────────────────────────────────
  ('vm-short-30',          'short-form-edit-30s',      'Basic short-form edit, up to 30 seconds','video-motion', 'video', 'creator', 'starting_at',  15000, 'up to 30s', 2, 5, 10),
  ('vm-reel-60',           'premium-reel-60s',         'Premium reel / short, up to 60 seconds', 'video-motion', 'video', 'creator', 'starting_at',  35000, 'up to 60s', 3, 7, 20),
  ('vm-social-3min',       'social-video-3min',        'Social video editing, up to 3 minutes',  'video-motion', 'video', 'creator', 'starting_at',  50000, 'up to 3 min', 4, 10, 30),
  ('vm-captions',          'subtitle-caption',         'Subtitle / caption treatment',           'video-motion', 'video', 'creator', 'starting_at',   5000, NULL, 1, 3, 40),
  ('vm-animated-text',     'animated-text-video',      'Simple animated text video',             'video-motion', 'video', 'creator', 'starting_at',  25000, NULL, 3, 7, 50),
  ('vm-logo-sting',        'logo-animation-sting',     'Logo animation / sting',                 'video-motion', 'video', 'creator', 'starting_at',  35000, NULL, 3, 7, 60),
  ('vm-motion-poster',     'motion-poster',            'Motion poster',                          'video-motion', 'video', 'creator', 'starting_at',  25000, NULL, 2, 5, 70),
  ('vm-animated-ad-15',    'animated-social-ad-15s',   'Animated social ad, up to 15 seconds',   'video-motion', 'video', 'creator', 'starting_at',  50000, 'up to 15s', 4, 10, 80),
  ('vm-explainer-30',      '2d-explainer-30s',         '2D explainer, up to 30 seconds',         'video-motion', 'video', 'creator', 'starting_at', 100000, 'up to 30s', 7, 18, 90),
  ('vm-animation-60',      '2d-animation-60s',         '2D animation, up to 60 seconds',         'video-motion', 'video', 'creator', 'starting_at', 200000, 'up to 60s', 14, 30, 100),
  ('vm-3d-product-15',     '3d-product-animation-15s', '3D product animation, up to 15 seconds', 'video-motion', 'video', 'creator', 'starting_at', 150000, 'up to 15s', 10, 24, 110),
  ('vm-cgi-film',          'cgi-product-film',         'CGI product film',                       'video-motion', 'video', 'creator', 'starting_at', 250000, NULL, 14, 35, 120),
  ('vm-vfx',               'vfx-compositing',          'VFX / compositing',                      'video-motion', 'video', 'creator', 'starting_at',  50000, NULL, 5, 15, 130),
  ('vm-edit-5min',         'video-editing-5min',       'Video editing, up to 5 minutes',         'video-motion', 'video', 'creator', 'starting_at', 100000, 'up to 5 min', 5, 14, 140),
  ('vm-commercial',        'commercial-production',    'Commercial production',                  'video-motion', 'video', 'creator', 'starting_at', 250000, NULL, 14, 40, 150),
  ('vm-brand-film',        'brand-film',               'Brand film',                             'video-motion', 'video', 'creator', 'starting_at', 350000, NULL, 21, 50, 160),
  ('vm-event-highlights',  'event-highlights-edit',    'Event highlights edit',                  'video-motion', 'video', 'creator', 'starting_at',  75000, NULL, 5, 14, 170),
  ('vm-podcast-opener',    'podcast-opener-package',   'Podcast opener package',                 'video-motion', 'video', 'creator', 'starting_at',  75000, NULL, 7, 14, 180),
  ('vm-podcast-graphics',  'podcast-graphics-package', 'Podcast graphics package',               'video-motion', 'digital','creator', 'starting_at',  50000, NULL, 5, 12, 190),
  ('vm-motion-package',    'motion-graphics-package',  'Motion graphics package',                'video-motion', 'video', 'creator', 'starting_at', 150000, NULL, 10, 25, 200),

  -- ── 06 Business & Digital Assets ────────────────────────────────────
  ('bd-profile-8',         'company-profile-8-pages',  'Company profile, up to 8 pages',  'business-digital', 'digital', 'creator', 'starting_at',  35000, 'up to 8 pages', 5, 10, 10),
  ('bd-profile-16',        'company-profile-16-pages', 'Company profile, up to 16 pages', 'business-digital', 'digital', 'creator', 'starting_at',  65000, 'up to 16 pages', 7, 16, 20),
  ('bd-deck-10',           'pitch-deck-10-slides',     'Pitch deck, up to 10 slides',     'business-digital', 'digital', 'creator', 'starting_at',  35000, 'up to 10 slides', 4, 10, 30),
  ('bd-deck-20',           'pitch-deck-20-slides',     'Pitch deck, up to 20 slides',     'business-digital', 'digital', 'creator', 'starting_at',  75000, 'up to 20 slides', 7, 16, 40),
  ('bd-proposal',          'business-proposal-layout', 'Business proposal layout',        'business-digital', 'digital', 'creator', 'starting_at',  25000, NULL, 3, 8, 50),
  ('bd-media-kit',         'media-kit',                'Media kit',                       'business-digital', 'digital', 'creator', 'starting_at',  25000, NULL, 3, 8, 60),
  ('bd-portfolio',         'portfolio-layout',         'Professional portfolio layout',   'business-digital', 'digital', 'creator', 'starting_at',  35000, NULL, 5, 12, 70),
  ('bd-catalogue',         'digital-product-catalogue','Digital product catalogue',       'business-digital', 'digital', 'creator', 'starting_at',  30000, NULL, 4, 10, 80),
  ('bd-ebook',             'ebook-layout-20-pages',    'E-book layout, up to 20 pages',   'business-digital', 'digital', 'creator', 'starting_at',  35000, 'up to 20 pages', 5, 12, 90),
  ('bd-landing-page',      'landing-page-ui',          'Landing page UI design',          'business-digital', 'digital', 'creator', 'starting_at',  75000, NULL, 7, 16, 100),
  ('bd-website-ui',        'website-ui-design',        'Website UI design',               'business-digital', 'digital', 'creator', 'starting_at', 150000, NULL, 14, 30, 110),
  ('bd-app-screen',        'app-ui-screen-design',     'App UI screen design',            'business-digital', 'digital', 'creator', 'per_screen',   25000, 'per screen', 5, 14, 120),
  ('bd-mockups',           'product-mockup-set',       'Product mockup set',              'business-digital', 'digital', 'creator', 'starting_at',  15000, NULL, 2, 6, 130),
  ('bd-newsletter',        'email-newsletter-design',  'Email newsletter design',         'business-digital', 'digital', 'creator', 'starting_at',  15000, NULL, 2, 6, 140),
  ('bd-dashboard',         'dashboard-ui-concept',     'Dashboard UI concept',            'business-digital', 'digital', 'creator', 'starting_at', 100000, NULL, 10, 25, 150),

  -- ── 09 Packages ─────────────────────────────────────────────────────
  ('pkg-essentials',       'business-essentials',      'Business Essentials',  'bundles', 'managed', 'creator', 'package',  45000, NULL, 7, 14, 10),
  ('pkg-brand-launch',     'brand-launch-kit',         'Brand Launch Kit',     'bundles', 'managed', 'creator', 'package', 125000, NULL, 10, 21, 20),
  ('pkg-growth-content',   'growth-content-pack',      'Growth Content Pack',  'bundles', 'managed', 'creator', 'package',  85000, NULL, 7, 14, 30),
  ('pkg-campaign-starter', 'campaign-starter',         'Campaign Starter',     'bundles', 'managed', 'creator', 'package', 150000, NULL, 14, 28, 40),
  ('pkg-motion-starter',   'motion-starter',           'Motion Starter',       'bundles', 'managed', 'creator', 'package', 100000, NULL, 10, 21, 50)
)
INSERT INTO public.services (
  sku, slug, name, category_id, deliverable_type, fulfilment, pricing_model,
  price_minor, price_unit, turnaround_min_days, turnaround_max_days,
  price_basis, price_source, quote_required, publication_status, sort_order
)
SELECT
  seed.sku, seed.slug, seed.name, c.id, seed.deliverable_type, seed.fulfilment, seed.pricing_model,
  seed.price_naira::bigint * 100, seed.price_unit, seed.t_min, seed.t_max,
  'proposed',
  'Founder launch catalogue, 2026-10-19 — a proposed price, not a verified rate',
  false,             -- the scope IS priceable; see the note in the schema file
  'published',
  seed.sort_order
FROM seed
JOIN public.service_categories c ON c.slug = seed.category_slug
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  category_id = EXCLUDED.category_id,
  deliverable_type = EXCLUDED.deliverable_type,
  pricing_model = EXCLUDED.pricing_model,
  price_unit = EXCLUDED.price_unit,
  turnaround_min_days = EXCLUDED.turnaround_min_days,
  turnaround_max_days = EXCLUDED.turnaround_max_days,
  sort_order = EXCLUDED.sort_order;
  -- NOT price_basis, NOT quote_required, NOT price_minor: re-running this file
  -- must never undo a price somebody has since properly quoted, nor reset one
  -- an admin has corrected.

-- ─────────────────────────────────────────────────────────────────────────
-- Print production — physical goods, benchmarked against published printers
-- ─────────────────────────────────────────────────────────────────────────

WITH seed (sku, slug, name, pricing_model, price_naira, price_unit, qty, t_min, t_max, sort_order) AS (VALUES
  ('pp-cards-standard', 'standard-business-cards',  'Standard business cards',    'tiered_quantity',  15000, '100 pieces', 100, 3, 5, 10),
  ('pp-cards-premium',  'premium-business-cards',   'Premium business cards',     'tiered_quantity',  25000, '100 pieces', 100, 3, 6, 20),
  ('pp-flyers-a5',      'a5-flyers',                'A5 flyers',                  'tiered_quantity',  15000, '100 pieces', 100, 3, 5, 30),
  ('pp-flyers-a4',      'a4-flyers',                'A4 flyers',                  'tiered_quantity',  25000, '50 pieces',   50, 3, 5, 40),
  ('pp-posters',        'printed-posters',          'Posters',                    'tiered_quantity',  15000, '50 pieces',   50, 3, 5, 50),
  ('pp-letterheads',    'printed-letterheads',      'Letterheads',                'tiered_quantity',  20000, '100 pieces', 100, 3, 5, 60),
  ('pp-stickers',       'printed-stickers-labels',  'Stickers / labels',          'tiered_quantity',  15000, '100 pieces', 100, 4, 7, 70),
  ('pp-rollup',         'roll-up-banner-printed',   'Roll-up banner with stand',  'tiered_quantity',  55000, 'each',         1, 3, 6, 80),
  ('pp-tshirt',         'printed-t-shirt',          'Printed T-shirt',            'per_unit',          7500, 'per piece',    1, 5, 10, 90),
  ('pp-mug',            'branded-mug',              'Branded mug',                'per_unit',          4000, 'per piece',    1, 5, 10, 100),
  ('pp-notepad',        'notepad-jotter',           'Notepad / jotter',           'per_unit',          5500, 'per piece',    1, 5, 10, 110),
  ('pp-shopping-bags',  'shopping-bags',            'Shopping bags',              'tiered_quantity',  28000, '100 pieces', 100, 7, 14, 120),
  ('pp-paper-bags',     'paper-packaging-bags',     'Paper packaging bags',       'tiered_quantity', 120000, '100 pieces', 100, 7, 14, 130),
  ('pp-product-boxes',  'custom-product-boxes',     'Custom product boxes',       'per_unit',          6500, 'per unit',     1, 10, 21, 140)
)
INSERT INTO public.services (
  sku, slug, name, category_id, deliverable_type, fulfilment, pricing_model,
  price_minor, price_unit, turnaround_min_days, turnaround_max_days,
  price_basis, price_source, price_source_seen,
  production_required, supplier_required, quote_required,
  publication_status, sort_order
)
SELECT
  seed.sku, seed.slug, seed.name, c.id, 'print', 'partner', seed.pricing_model,
  seed.price_naira::bigint * 100, seed.price_unit, seed.t_min, seed.t_max,
  'indicative',
  'Published Nigerian printer retail listings, via the founder launch brief',
  DATE '2026-10-19',
  true, true, false,
  'published', seed.sort_order
FROM seed
JOIN public.service_categories c ON c.slug = 'print-production'
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name, category_id = EXCLUDED.category_id,
  pricing_model = EXCLUDED.pricing_model, price_unit = EXCLUDED.price_unit,
  turnaround_min_days = EXCLUDED.turnaround_min_days,
  turnaround_max_days = EXCLUDED.turnaround_max_days,
  sort_order = EXCLUDED.sort_order;

/* The quantity each printed price actually buys. */
INSERT INTO public.service_price_tiers (service_id, min_quantity, price_minor)
SELECT s.id, v.qty, s.price_minor
FROM (VALUES
  ('pp-cards-standard', 100), ('pp-cards-premium', 100), ('pp-flyers-a5', 100),
  ('pp-flyers-a4', 50), ('pp-posters', 50), ('pp-letterheads', 100),
  ('pp-stickers', 100), ('pp-rollup', 1), ('pp-shopping-bags', 100),
  ('pp-paper-bags', 100)
) AS v(sku, qty)
JOIN public.services s ON s.sku = v.sku
ON CONFLICT (service_id, min_quantity) DO UPDATE SET price_minor = EXCLUDED.price_minor;

-- ─────────────────────────────────────────────────────────────────────────
-- Quote-only production: no rate card exists, so no number is shown
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.services (
  sku, slug, name, category_id, deliverable_type, fulfilment, pricing_model,
  price_minor, price_basis, price_source,
  production_required, supplier_required, quote_required,
  publication_status, sort_order
)
SELECT v.sku, v.slug, v.name, c.id, 'print', 'partner', 'custom_quote',
       NULL, 'proposed',
       'No rate card exists for this; it varies by site, material and survey',
       true, true, true, 'published', v.sort_order
FROM (VALUES
  ('pp-signage',   'shop-signage-production',  'Shop signage',          200),
  ('pp-vehicle',   'vehicle-branding-production','Vehicle branding',    210),
  ('pp-backdrop',  'large-format-backdrop',    'Large-format backdrop', 220)
) AS v(sku, slug, name, sort_order)
JOIN public.service_categories c ON c.slug = 'print-production'
ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────────────────────────────────
-- Synonyms — what customers actually type
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.service_synonyms (service_id, term)
SELECT s.id, v.term
FROM (VALUES
  ('ds-business-card', 'visiting card'), ('ds-business-card', 'complimentary card'),
  ('ds-business-card', 'contact card'),  ('ds-business-card', 'name card'),
  ('ds-flyer', 'handbill'),              ('ds-flyer', 'promo design'),
  ('ds-event-flyer', 'event graphic'),   ('ds-menu', 'food menu'),
  ('ds-menu', 'drinks menu'),            ('ds-menu', 'restaurant menu'),
  ('br-identity', 'branding kit'),       ('br-identity', 'visual identity'),
  ('br-identity', 'brand kit'),          ('vm-logo-sting', 'logo reveal'),
  ('vm-logo-sting', 'animated logo'),    ('pk-box', 'box design'),
  ('pk-label-system', 'label design'),   ('pk-pouch', 'product pack'),
  ('bd-profile-8', 'corporate profile'), ('bd-profile-8', 'business profile document'),
  ('bd-deck-10', 'investor presentation'), ('bd-deck-10', 'funding deck'),
  ('vm-short-30', 'reel'),               ('vm-short-30', 'tiktok video'),
  ('vm-short-30', 'youtube short'),      ('ds-social-graphic', 'instagram post')
) AS v(sku, term)
JOIN public.services s ON s.sku = v.sku
ON CONFLICT (service_id, term) DO NOTHING;

DO $$
DECLARE total int; orderable int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_orderable) INTO total, orderable
    FROM public.services;
  RAISE NOTICE 'Catalogue seeded: % services, % orderable (expected 0 until real quotes land).',
    total, orderable;
END $$;
