/*
  # Seed media_services with realistic creative services

  Inserts a starter catalogue of creative services. Guarded so it only runs
  when the table is empty — it will never overwrite or duplicate real data.
*/

INSERT INTO media_services
  (title, service_type, description, pricing, pricing_model, delivery_time, clients_served, review_count, rating, status)
SELECT * FROM (VALUES
  ('Lens & Light Photography — Product Shoots', 'Photography', 'Studio product photography for e-commerce and catalogues. Includes 20 retouched images, white background and lifestyle setups.', 350::numeric, 'per shoot', '5 days', 140, 62, 4.8::numeric, 'open'),
  ('Kalahari Films — Brand Video Production', 'Videography', 'Full-service brand films and TV commercials: scripting, shooting, colour grading and sound design. 30-90 second final cuts.', 2500, 'per project', '21 days', 85, 41, 4.9, 'open'),
  ('Sable Studio — Logo & Brand Identity', 'Branding', 'Complete identity package: logo suite, colour system, typography, brand guidelines PDF and social media kit.', 800, 'per project', '14 days', 210, 98, 4.7, 'open'),
  ('Ubuntu Digital — Social Media Management', 'Social Media Management', 'Monthly content calendar, 20 designed posts, community management and a performance report across Instagram, X and TikTok.', 450, 'per month', 'ongoing', 96, 54, 4.6, 'open'),
  ('Baobab Motion — 2D Explainer Animation', 'Animation', 'Animated explainer videos with script, storyboard, voice-over and custom illustration. Up to 90 seconds.', 1200, 'per video', '18 days', 58, 33, 4.8, 'open'),
  ('Sahara Sound — Radio Jingle & Audio Ads', 'Audio Production', 'Catchy radio jingles and audio spots in English, French, Swahili or Pidgin. Includes composition, voice talent and mastering.', 300, 'per spot', '7 days', 175, 80, 4.5, 'open'),
  ('Nairobi Drone Collective — Aerial Coverage', 'Drone Photography', 'Licensed drone pilots for real estate, events and documentaries. 4K footage plus edited highlight reel.', 550, 'per day', '5 days', 64, 29, 4.7, 'open'),
  ('Accra Creative Lab — Web & Landing Page Design', 'Web Design', 'Conversion-focused landing pages and small business sites. Design in Figma, responsive build, basic SEO setup.', 950, 'per site', '14 days', 120, 66, 4.6, 'open'),
  ('Jollof Post — Video Editing & Colour Grading', 'Video Editing', 'Post-production for creators and agencies: multi-cam editing, motion titles, colour grading and delivery in all aspect ratios.', 200, 'per minute of output', '4 days', 230, 112, 4.8, 'open'),
  ('Kigali Sessions — Podcast Production', 'Podcast Production', 'End-to-end podcast production: recording, editing, show notes, cover art and distribution to all platforms.', 180, 'per episode', '3 days', 44, 21, 4.9, 'open'),
  ('Zebra Ink — Print & Packaging Design', 'Graphic Design', 'Flyers, billboards, product packaging and print-ready artwork with supplier liaison for CMYK production.', 260, 'per design', '6 days', 190, 87, 4.5, 'open'),
  ('Lagos Wedding Stories — Event Coverage', 'Event Photography', 'Weddings, launches and conferences covered by a two-person crew. 300+ edited photos and a same-week highlight video.', 700, 'per event', '10 days', 155, 74, 4.7, 'open'),
  ('Savanna UX — Mobile App UI/UX Design', 'UI/UX Design', 'User research, wireframes and polished UI kits for iOS and Android apps, delivered as developer-ready Figma files.', 1500, 'per project', '21 days', 39, 18, 4.8, 'open'),
  ('AfroBeat Visuals — Music Video Production', 'Videography', 'Concept-to-delivery music videos with location scouting, styling, cinematography and VFX-ready editing.', 3000, 'per video', '30 days', 47, 25, 4.6, 'open'),
  ('Cape Copy Co. — Copywriting & Content', 'Content Creation', 'Website copy, ad scripts, blog articles and product descriptions written for African audiences in EN/FR/PT.', 120, 'per 1000 words', '3 days', 260, 130, 4.7, 'open'),
  ('Kampala Motion — Logo Animation & Stingers', 'Motion Graphics', 'Animated logos, lower thirds and broadcast stingers for TV stations, YouTubers and event screens.', 240, 'per animation', '5 days', 91, 45, 4.6, 'open'),
  ('Dakar Retouch — Photo Editing & Restoration', 'Photo Editing', 'High-end retouching, background removal, colour correction and old photo restoration with 48-hour rush option.', 15, 'per image', '2 days', 340, 150, 4.5, 'open'),
  ('Joburg Influence — Influencer Campaign Management', 'Influencer Marketing', 'Campaign strategy, creator sourcing, content approval and reporting across African influencer networks.', 1000, 'per campaign', '30 days', 52, 27, 4.4, 'open')
) AS seed(title, service_type, description, pricing, pricing_model, delivery_time, clients_served, review_count, rating, status)
WHERE NOT EXISTS (SELECT 1 FROM media_services);
