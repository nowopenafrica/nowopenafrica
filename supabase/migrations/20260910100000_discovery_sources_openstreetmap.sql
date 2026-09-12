/*
  # Add OpenStreetMap and BusinessList discovery sources

  ## OpenStreetMap Overpass (openstreetmap)

  OpenStreetMap data is licensed under the Open Database Licence (ODbL) with
  CC-BY-SA attribution. Automated access, bulk extraction and redistribution
  are explicitly permitted under the ODbL — the licence was designed for this.
  The Overpass API is a free, public, read-only query endpoint.

  ## BusinessList.com.ng (businesslist_ng)

  ALREADY EXISTS in radar_sources as prohibited. This migration updates the
  source name and notes to clarify that a real adapter now exists but the
  source remains disabled until a signed agreement is in place. Their terms
  prohibit bots, crawlers, scrapers, bulk extraction and competing datasets.

  Re-runnable via IF NOT EXISTS / ON CONFLICT.
*/

-- OpenStreetMap Overpass: fully open, pan-African, CC-BY-SA / ODbL.
INSERT INTO public.radar_sources (
  key, name, kind, active,
  automated_access, bulk_extraction, competing_dataset, redistribution,
  licence, authorised_by, authorised_at, notes
) VALUES (
  'openstreetmap',
  'OpenStreetMap Overpass',
  'open_data',
  true,
  'permitted', 'permitted', 'permitted', 'permitted',
  'ODbL 1.0 (Open Database Licence) with CC-BY-SA 4.0 attribution',
  'NowOpen Africa',
  now(),
  'Pan-African business data from the Overpass API. ODbL permits automated access, '
  || 'bulk extraction and redistribution with attribution. Images from Wikimedia Commons '
  || 'are NOT ODbL and must not be taken. Attribution: "Database: OpenStreetMap; '
  || 'ODbL: https://opendatacommons.org/licenses/odbl/".'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  active = EXCLUDED.active,
  automated_access = EXCLUDED.automated_access,
  bulk_extraction = EXCLUDED.bulk_extraction,
  competing_dataset = EXCLUDED.competing_dataset,
  redistribution = EXCLUDED.redistribution,
  licence = EXCLUDED.licence,
  authorised_by = EXCLUDED.authorised_by,
  authorised_at = EXCLUDED.authorised_at,
  notes = EXCLUDED.notes;

-- BusinessList.com.ng: keep disabled, update notes to reflect the real adapter.
INSERT INTO public.radar_sources (
  key, name, kind, active,
  automated_access, bulk_extraction, competing_dataset, redistribution,
  licence, authorised_by, authorised_at, notes
) VALUES (
  'businesslist_ng',
  'BusinessList.com.ng',
  'licensed_directory',
  false,
  'prohibited', 'prohibited', 'prohibited', 'prohibited',
  NULL, NULL, NULL,
  'Nigeria''s largest business directory. Their terms explicitly prohibit bots, '
  || 'crawlers, scrapers, bulk extraction and use in a competing dataset. '
  || 'A real adapter exists (api/acquire/businesslist.ts) but the source gate '
  || 'refuses all operations until a signed agreement changes this record. '
  || 'robots.txt permitting crawling is a bot-traffic rule, not a content licence.'
) ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  notes = EXCLUDED.notes;
