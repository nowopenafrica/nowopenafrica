-- 30 realistic African business profiles spanning the category taxonomy in
-- src/data/categories.ts — each with a real logo, cover banner, description,
-- phone/location, and 2-3 services or products with realistic local-currency
-- prices, plus a couple of gallery photos where available. Deliberately
-- covers the categories with a dashboard "module" (Hotel, Restaurant, Spa,
-- Salon, Real Estate, Legal Services, etc.) so the booking/reservation/cart
-- features actually have real data to show off.
--
-- All image URLs are Pexels stock photos (images.pexels.com), verified
-- reachable (HTTP 200) before writing this file.
--
-- Safe to re-run: businesses are upserted by their unique `username`, and
-- each business's own services/products/gallery rows are cleared and
-- re-inserted (scoped to that business_id only — this never touches any
-- other business's data). No owner is assigned (user_id stays NULL) since
-- these are admin-seeded showcase profiles, not tied to a signed-up user.
--
-- Run this once via the Supabase SQL Editor. It can't be applied
-- automatically from this environment (no service-role/DB credentials).


DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 1. Golden Sands Hotel — Hotel & Lodging — Lagos, Nigeria ------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Golden Sands Hotel', 'golden-sands-hotel',
    'A boutique hotel in the heart of Lagos offering comfortable rooms, a rooftop pool and warm Nigerian hospitality for business and leisure travellers.',
    'Hotel & Lodging', 'Lagos, Nigeria', '08012345001', 'reservations@goldensandshotel.ng', 'https://goldensandshotel.ng',
    'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/261102/pexels-photo-261102.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.6
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Standard Room', 'Cozy room with queen bed, AC, free WiFi and breakfast included.', '₦25,000/night'),
    (biz_id, 'Deluxe Room', 'Spacious room with king bed, city view and mini-bar.', '₦40,000/night'),
    (biz_id, 'Executive Suite', 'Suite with living area, rooftop pool access and complimentary airport pickup.', '₦75,000/night');

  DELETE FROM business_gallery WHERE business_id = biz_id;
  INSERT INTO business_gallery (business_id, image_url, caption) VALUES
    (biz_id, 'https://images.pexels.com/photos/261102/pexels-photo-261102.jpeg?auto=compress&cs=tinysrgb&w=640', 'Hotel lobby'),
    (biz_id, 'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=640', 'Deluxe room');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 2. Serengeti Lodge & Suites — Hotel & Lodging — Nairobi, Kenya ------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Serengeti Lodge & Suites', 'serengeti-lodge-suites',
    'A tranquil lodge on the outskirts of Nairobi with garden views, a safari-themed restaurant and easy access to major game parks.',
    'Hotel & Lodging', 'Nairobi, Kenya', '0712345002', 'info@serengetilodge.ke', 'https://serengetilodge.ke',
    'https://images.pexels.com/photos/261102/pexels-photo-261102.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/271624/pexels-photo-271624.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.4
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Garden View Room', 'Comfortable room overlooking the lodge gardens.', 'KSh 8,500/night'),
    (biz_id, 'Safari Suite', 'Suite with private balcony, ideal for safari travelers.', 'KSh 18,000/night'),
    (biz_id, 'Family Cottage', 'Two-bedroom cottage sleeping up to 5 guests.', 'KSh 25,000/night');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 3. Nomad's Nest Short-lets — Guesthouse & Short-let / B&B — Accra ---
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Nomad''s Nest Short-lets', 'nomads-nest-shortlets',
    'Fully furnished short-let apartments in Accra for remote workers, relocating families and weekend travelers — flexible nightly or monthly rates.',
    'Guesthouse & Short-let / B&B', 'Accra, Ghana', '0244123003', 'stay@nomadsnest.gh', 'https://nomadsnest.gh',
    'https://images.pexels.com/photos/189333/pexels-photo-189333.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/189333/pexels-photo-189333.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', false, 4.2
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Studio Apartment', 'Compact self-contained studio, ideal for solo stays.', 'GH₵350/night'),
    (biz_id, '1-Bedroom Apartment', 'Fully furnished apartment with kitchenette.', 'GH₵550/night'),
    (biz_id, '2-Bedroom Apartment', 'Spacious apartment suited to families or small groups.', 'GH₵850/night');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 4. Mama Put Kitchen — Restaurant — Lagos, Nigeria -------------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Mama Put Kitchen', 'mama-put-kitchen',
    'A cozy neighborhood restaurant in Lagos serving authentic Nigerian dishes made fresh daily — jollof rice, swallow and grilled specials.',
    'Restaurant', 'Lagos, Nigeria', '08023456004', 'hello@mamaputkitchen.ng', null,
    'https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/1307698/pexels-photo-1307698.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.7
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Jollof Rice & Chicken', 'Smoky party-style jollof rice with grilled chicken.', '₦3,500', 'https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Pounded Yam & Egusi Soup', 'Freshly pounded yam served with rich egusi soup.', '₦4,000', 'https://images.pexels.com/photos/1307698/pexels-photo-1307698.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Suya Platter', 'Spicy grilled beef skewers with onions and pepper mix.', '₦2,500', 'https://images.pexels.com/photos/67468/pexels-photo-67468.jpeg?auto=compress&cs=tinysrgb&w=640');

  DELETE FROM business_gallery WHERE business_id = biz_id;
  INSERT INTO business_gallery (business_id, image_url, caption) VALUES
    (biz_id, 'https://images.pexels.com/photos/67468/pexels-photo-67468.jpeg?auto=compress&cs=tinysrgb&w=640', 'Dining area'),
    (biz_id, 'https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=640', 'Signature jollof rice');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 5. Nyama Choma Grill House — Restaurant — Nairobi, Kenya ------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Nyama Choma Grill House', 'nyama-choma-grill-house',
    'A lively Nairobi grill house famous for its charcoal-roasted nyama choma, ugali and ice-cold drinks in a relaxed, family-friendly setting.',
    'Restaurant', 'Nairobi, Kenya', '0723456005', 'orders@nyamachomagrill.ke', null,
    'https://images.pexels.com/photos/1307698/pexels-photo-1307698.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.5
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Nyama Choma (1kg)', 'Charcoal-grilled goat or beef, served with kachumbari.', 'KSh 1,800', 'https://images.pexels.com/photos/1307698/pexels-photo-1307698.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Ugali & Sukuma Wiki', 'Classic side of ugali with sautéed collard greens.', 'KSh 400', 'https://images.pexels.com/photos/67468/pexels-photo-67468.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Grilled Tilapia', 'Whole tilapia grilled to order with a side of ugali.', 'KSh 1,200', 'https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 6. QuickBite Express — Fast Food — Lagos, Nigeria -------------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'QuickBite Express', 'quickbite-express',
    'Fast, affordable burgers, wraps and fries for Lagos on the go — quick service without compromising on taste.',
    'Fast Food', 'Lagos, Nigeria', '08034567006', 'hello@quickbiteng.com', null,
    'https://images.pexels.com/photos/1633525/pexels-photo-1633525.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', false, 4.0
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Classic Beef Burger', 'Grilled beef patty, cheese, lettuce and house sauce.', '₦2,200', 'https://images.pexels.com/photos/1633525/pexels-photo-1633525.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Crispy Chicken Wrap', 'Crispy chicken strips wrapped with fresh veggies.', '₦2,000', 'https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Loaded Fries', 'Fries topped with cheese sauce, beef bits and jalapeños.', '₦1,500', 'https://images.pexels.com/photos/1633525/pexels-photo-1633525.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 7. Bean & Batter Café — Café & Bakery — Cape Town, South Africa -----
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Bean & Batter Café', 'bean-and-batter-cafe',
    'A sunny Cape Town café serving specialty coffee, fresh-baked pastries and artisan sourdough — a favourite morning stop.',
    'Café & Bakery', 'Cape Town, South Africa', '0821234007', 'hello@beanandbatter.co.za', 'https://beanandbatter.co.za',
    'https://images.pexels.com/photos/1058959/pexels-photo-1058959.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/887853/pexels-photo-887853.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.6
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Flat White', 'Double shot espresso with silky steamed milk.', 'R35', 'https://images.pexels.com/photos/1058959/pexels-photo-1058959.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Croissant', 'Buttery, flaky French-style croissant baked fresh daily.', 'R28', 'https://images.pexels.com/photos/887853/pexels-photo-887853.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Sourdough Loaf', 'Naturally leavened sourdough with a crisp crust.', 'R55', 'https://images.pexels.com/photos/887853/pexels-photo-887853.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 8. Skyline Lounge & Bar — Bar & Lounge — Johannesburg ---------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Skyline Lounge & Bar', 'skyline-lounge-bar',
    'A rooftop lounge in Johannesburg with panoramic city views, hand-crafted cocktails and live DJ sets every weekend.',
    'Bar & Lounge', 'Johannesburg, South Africa', '0827654008', 'bookings@skylinelounge.co.za', null,
    'https://images.pexels.com/photos/274192/pexels-photo-274192.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/3856033/pexels-photo-3856033.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.3
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Craft Cocktail', 'Signature cocktail made with locally distilled spirits.', 'R95', 'https://images.pexels.com/photos/274192/pexels-photo-274192.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'House Wine (Glass)', 'Glass of red or white wine from our South African selection.', 'R65', 'https://images.pexels.com/photos/3856033/pexels-photo-3856033.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Sharing Platter', 'Mixed grill and snack platter for 2-3 people.', 'R180', 'https://images.pexels.com/photos/3856033/pexels-photo-3856033.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 9. Feast Masters Catering — Catering — Abuja, Nigeria ---------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Feast Masters Catering', 'feast-masters-catering',
    'Full-service event catering in Abuja for weddings, corporate functions and private parties — from small chops to full buffets.',
    'Catering', 'Abuja, Nigeria', '08045678009', 'events@feastmasters.ng', 'https://feastmasters.ng',
    'https://images.pexels.com/photos/5779362/pexels-photo-5779362.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/5638732/pexels-photo-5638732.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.8
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Small Chops Package (100 pcs)', 'Assorted small chops — spring rolls, samosas, puff puff and more.', '₦45,000', 'https://images.pexels.com/photos/5779362/pexels-photo-5779362.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Full Event Buffet (per head)', 'Rice, swallow, protein and salad buffet for large events.', '₦8,500', 'https://images.pexels.com/photos/5638732/pexels-photo-5638732.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Wedding Cake (3-tier)', 'Custom-designed 3-tier wedding cake, flavor of choice.', '₦120,000', 'https://images.pexels.com/photos/5779362/pexels-photo-5779362.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 10. Serenity Spa & Wellness — Spa & Beauty — Nairobi, Kenya ---------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Serenity Spa & Wellness', 'serenity-spa-wellness',
    'A peaceful Nairobi spa offering massage, facials and body treatments to help you relax and recharge.',
    'Spa & Beauty', 'Nairobi, Kenya', '0734567010', 'book@serenityspa.ke', 'https://serenityspa.ke',
    'https://images.pexels.com/photos/3985062/pexels-photo-3985062.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/3985062/pexels-photo-3985062.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.7
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Swedish Massage (60 min)', 'Full-body relaxation massage with aromatic oils.', 'KSh 3,500'),
    (biz_id, 'Facial Treatment', 'Deep-cleansing facial tailored to your skin type.', 'KSh 2,800'),
    (biz_id, 'Full Body Spa Package', 'Massage, facial and body scrub combo.', 'KSh 7,500');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 11. Kings Cut Barbershop — Salon / Barber — Lagos, Nigeria ----------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Kings Cut Barbershop', 'kings-cut-barbershop',
    'A modern Lagos barbershop offering sharp fades, beard grooming and a relaxed atmosphere for the everyday gentleman.',
    'Salon / Barber', 'Lagos, Nigeria', '08056789011', 'kingscut@barbershop.ng', null,
    'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/1813272/pexels-photo-1813272.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', false, 4.5
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Haircut & Beard Trim', 'Sharp fade or trim with a clean beard line-up.', '₦3,000'),
    (biz_id, 'Kids Haircut', 'Quick, friendly haircut for children under 12.', '₦1,500'),
    (biz_id, 'Full Grooming Package', 'Haircut, shave, facial scrub and hot towel finish.', '₦6,000');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 12. IronCore Fitness Studio — Fitness & Gym — Accra, Ghana ----------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'IronCore Fitness Studio', 'ironcore-fitness-studio',
    'A modern Accra gym with free weights, group classes and certified personal trainers to help you hit your fitness goals.',
    'Fitness & Gym', 'Accra, Ghana', '0208901012', 'join@ironcorefitness.gh', 'https://ironcorefitness.gh',
    'https://images.pexels.com/photos/1954524/pexels-photo-1954524.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/2261477/pexels-photo-2261477.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.4
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Monthly Membership', 'Unlimited access to gym floor and cardio equipment.', 'GH₵250'),
    (biz_id, 'Personal Training (per session)', 'One-on-one coaching with a certified trainer.', 'GH₵100'),
    (biz_id, 'Group HIIT Class', 'High-intensity interval training, drop-in welcome.', 'GH₵40');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 13. Wellspring Medical Centre — Hospital & Clinic — Lagos -----------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Wellspring Medical Centre', 'wellspring-medical-centre',
    'A full-service Lagos clinic offering general consultations, diagnostics and preventive care for the whole family.',
    'Hospital & Clinic', 'Lagos, Nigeria', '08067890013', 'appointments@wellspringmed.ng', 'https://wellspringmed.ng',
    'https://images.pexels.com/photos/4021775/pexels-photo-4021775.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/4021775/pexels-photo-4021775.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.6
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'General Consultation', 'Consultation with a licensed general practitioner.', '₦8,000'),
    (biz_id, 'Full Body Checkup', 'Comprehensive health screening with lab tests.', '₦35,000'),
    (biz_id, 'Vaccination', 'Routine and travel vaccinations for all ages.', '₦5,000');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 14. BrightSmile Dental Clinic — Dental Care — Nairobi ---------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'BrightSmile Dental Clinic', 'brightsmile-dental-clinic',
    'A friendly Nairobi dental practice offering checkups, cleaning and cosmetic dentistry in a comfortable, modern setting.',
    'Dental Care', 'Nairobi, Kenya', '0745678014', 'smile@brightsmile.ke', 'https://brightsmile.ke',
    'https://images.pexels.com/photos/3845810/pexels-photo-3845810.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/3845810/pexels-photo-3845810.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.5
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Dental Checkup & Cleaning', 'Routine exam and professional cleaning.', 'KSh 2,500'),
    (biz_id, 'Tooth Extraction', 'Simple extraction with local anesthesia.', 'KSh 4,000'),
    (biz_id, 'Teeth Whitening', 'In-office whitening treatment for a brighter smile.', 'KSh 12,000');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 15. PetCare Veterinary Clinic — Veterinary Services — Johannesburg --
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'PetCare Veterinary Clinic', 'petcare-veterinary-clinic',
    'A trusted Johannesburg veterinary clinic providing checkups, vaccinations and surgery for dogs, cats and small pets.',
    'Veterinary Services', 'Johannesburg, South Africa', '0836789015', 'care@petcarevet.co.za', null,
    'https://images.pexels.com/photos/6235233/pexels-photo-6235233.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/5731869/pexels-photo-5731869.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', false, 4.3
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Wellness Checkup', 'Routine physical exam for dogs and cats.', 'R350'),
    (biz_id, 'Vaccination Package', 'Core vaccinations for puppies, kittens and adult pets.', 'R450'),
    (biz_id, 'Spay/Neuter Surgery', 'Sterilization surgery with post-op care.', 'R1,200');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 16. Lens & Light Studios — Photography & Video — Lagos --------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Lens & Light Studios', 'lens-and-light-studios',
    'A Lagos photography studio specializing in portraits, weddings and product photography with a modern, editorial style.',
    'Photography & Video', 'Lagos, Nigeria', '08078901016', 'book@lensandlight.ng', 'https://lensandlight.ng',
    'https://images.pexels.com/photos/90946/pexels-photo-90946.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/279906/pexels-photo-279906.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.9
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Portrait Session', 'One-hour studio portrait session with 10 edited images.', '₦40,000'),
    (biz_id, 'Wedding Coverage (Full Day)', 'Full-day wedding photography with two shooters.', '₦350,000'),
    (biz_id, 'Product Photography (per 10 items)', 'Clean e-commerce product shots on white background.', '₦60,000');

  DELETE FROM business_gallery WHERE business_id = biz_id;
  INSERT INTO business_gallery (business_id, image_url, caption) VALUES
    (biz_id, 'https://images.pexels.com/photos/90946/pexels-photo-90946.jpeg?auto=compress&cs=tinysrgb&w=640', 'Studio setup'),
    (biz_id, 'https://images.pexels.com/photos/279906/pexels-photo-279906.jpeg?auto=compress&cs=tinysrgb&w=640', 'Recent shoot');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 17. Elegant Occasions Events — Event Planning — Accra ---------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Elegant Occasions Events', 'elegant-occasions-events',
    'An Accra-based event planning company creating unforgettable weddings, corporate events and celebrations from concept to execution.',
    'Event Planning', 'Accra, Ghana', '0249012017', 'plan@elegantoccasions.gh', 'https://elegantoccasions.gh',
    'https://images.pexels.com/photos/169198/pexels-photo-169198.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/169198/pexels-photo-169198.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.7
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Wedding Planning Package', 'Full wedding planning from venue to vendor coordination.', 'GH₵15,000'),
    (biz_id, 'Corporate Event Package', 'Conference and product launch planning and execution.', 'GH₵8,000'),
    (biz_id, 'Birthday Party Package', 'Themed decor, catering coordination and entertainment.', 'GH₵3,500');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 18. SafariLink Travel & Tours — Travel & Tourism — Nairobi ----------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'SafariLink Travel & Tours', 'safarilink-travel-tours',
    'A Nairobi tour operator offering guided safaris, beach getaways and airport transfer packages across Kenya.',
    'Travel & Tourism', 'Nairobi, Kenya', '0756789018', 'book@safarilink.ke', 'https://safarilink.ke',
    'https://images.pexels.com/photos/1051073/pexels-photo-1051073.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/2413613/pexels-photo-2413613.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.6
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, '3-Day Maasai Mara Safari', 'Guided game drives, park fees and lodge accommodation included.', 'KSh 45,000'),
    (biz_id, 'Mombasa Beach Getaway (4 nights)', 'Beachfront hotel stay with return transport from Nairobi.', 'KSh 38,000'),
    (biz_id, 'Airport Transfer Package', 'Private airport pickup and drop-off, Nairobi metro area.', 'KSh 3,000');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 19. Prime Homes Realty — Real Estate — Lagos, Nigeria ---------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Prime Homes Realty', 'prime-homes-realty',
    'A Lagos real estate agency helping buyers and renters find quality homes across Lekki, Ikeja and Ikoyi — viewings booked directly online.',
    'Real Estate', 'Lagos, Nigeria', '08089012019', 'listings@primehomesrealty.ng', 'https://primehomesrealty.ng',
    'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.5
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, '3-Bedroom Duplex, Lekki', 'Modern duplex in a serene estate with 24/7 power and security.', '₦85,000,000', 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, '2-Bedroom Apartment, Ikeja', 'Well-located apartment close to the airport and business district.', '₦45,000,000', 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, '5-Bedroom Detached House, Ikoyi', 'Luxury detached house with BQ, pool and private compound.', '₦250,000,000', 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 20. Adeyemi & Partners Law Firm — Legal Services — Lagos ------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Adeyemi & Partners Law Firm', 'adeyemi-partners-law-firm',
    'A Lagos law firm specializing in property law, business registration and civil litigation, with over 15 years of combined experience.',
    'Legal Services', 'Lagos, Nigeria', '08090123020', 'consult@adeyemilaw.ng', 'https://adeyemilaw.ng',
    'https://images.pexels.com/photos/5668772/pexels-photo-5668772.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/5669602/pexels-photo-5669602.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.8
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Legal Consultation (1 hour)', 'One-on-one consultation on your legal matter.', '₦25,000'),
    (biz_id, 'Property Documentation', 'Title verification, C of O processing and conveyancing.', '₦150,000'),
    (biz_id, 'Business Registration', 'Full CAC registration for new businesses.', '₦80,000');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 21. AutoFix Garage & Servicing — Automotive — Nairobi ---------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'AutoFix Garage & Servicing', 'autofix-garage-servicing',
    'A Nairobi auto garage offering full servicing, brake work and diagnostics for all vehicle makes, with same-day turnaround.',
    'Automotive', 'Nairobi, Kenya', '0767890021', 'service@autofix.ke', null,
    'https://images.pexels.com/photos/3806249/pexels-photo-3806249.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/4489749/pexels-photo-4489749.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', false, 4.2
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Full Service & Oil Change', 'Complete service with oil, filter and inspection.', 'KSh 4,500'),
    (biz_id, 'Brake Pad Replacement', 'Front or rear brake pad replacement, per axle.', 'KSh 6,000'),
    (biz_id, 'Wheel Alignment', 'Computerized 4-wheel alignment.', 'KSh 2,000');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 22. SparkleClean Services — Cleaning Services — Accra ---------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'SparkleClean Services', 'sparkleclean-services',
    'Professional home and office cleaning in Accra — trained, vetted staff and eco-friendly cleaning products.',
    'Cleaning Services', 'Accra, Ghana', '0261234022', 'book@sparkleclean.gh', 'https://sparkleclean.gh',
    'https://images.pexels.com/photos/4239146/pexels-photo-4239146.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/6197122/pexels-photo-6197122.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.4
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'Standard Home Cleaning', 'Routine cleaning for a 2-3 bedroom home.', 'GH₵180'),
    (biz_id, 'Deep Cleaning Package', 'Thorough top-to-bottom deep clean, including appliances.', 'GH₵350'),
    (biz_id, 'Office Cleaning (per visit)', 'Cleaning for small to medium office spaces.', 'GH₵250');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 23. UrbanStyle Boutique — Retail Store — Lagos, Nigeria -------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'UrbanStyle Boutique', 'urbanstyle-boutique',
    'A Lagos fashion boutique curating stylish everyday wear, accessories and statement pieces for men and women.',
    'Retail Store', 'Lagos, Nigeria', '08001234023', 'shop@urbanstyle.ng', null,
    'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/1005638/pexels-photo-1005638.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.5
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Ankara Print Dress', 'Handmade Ankara dress, available in multiple sizes.', '₦18,000', 'https://images.pexels.com/photos/994523/pexels-photo-994523.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Men''s Casual Shirt', 'Breathable cotton shirt, slim fit.', '₦9,500', 'https://images.pexels.com/photos/934070/pexels-photo-934070.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Leather Handbag', 'Genuine leather handbag with adjustable strap.', '₦25,000', 'https://images.pexels.com/photos/1884581/pexels-photo-1884581.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 24. Ankara Threads Fashion House — Fashion & Apparel — Accra --------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Ankara Threads Fashion House', 'ankara-threads-fashion-house',
    'An Accra tailoring house creating custom Ankara and Kente garments for weddings, office wear and special occasions.',
    'Fashion & Apparel', 'Accra, Ghana', '0271234024', 'orders@ankarathreads.gh', 'https://ankarathreads.gh',
    'https://images.pexels.com/photos/994523/pexels-photo-994523.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/1884581/pexels-photo-1884581.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.7
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Custom Ankara Gown', 'Made-to-measure gown in your choice of Ankara fabric.', 'GH₵450', 'https://images.pexels.com/photos/994523/pexels-photo-994523.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Kente Cloth (per yard)', 'Authentic hand-woven Kente cloth.', 'GH₵120', 'https://images.pexels.com/photos/1884581/pexels-photo-1884581.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Tailored Suit', 'Custom two-piece suit, made to measure.', 'GH₵850', 'https://images.pexels.com/photos/934070/pexels-photo-934070.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 25. TechHub Electronics — Electronics — Lagos, Nigeria --------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'TechHub Electronics', 'techhub-electronics',
    'A Lagos electronics store stocking the latest smartphones, laptops and accessories, with genuine warranties on all items.',
    'Electronics', 'Lagos, Nigeria', '08012345025', 'sales@techhubng.com', 'https://techhubng.com',
    'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', false, 4.1
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Samsung Galaxy A54', 'Brand new, factory unlocked, 1-year warranty.', '₦320,000', 'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'HP Laptop 15-inch', 'Intel Core i5, 8GB RAM, 512GB SSD.', '₦450,000', 'https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Wireless Earbuds', 'Bluetooth 5.0 earbuds with charging case.', '₦25,000', 'https://images.pexels.com/photos/574071/pexels-photo-574071.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 26. Golden Gem Jewellers — Jewelry & Accessories — Johannesburg -----
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Golden Gem Jewellers', 'golden-gem-jewellers',
    'A Johannesburg jewellery house offering fine gold, silver and diamond pieces, plus custom engagement ring design.',
    'Jewelry & Accessories', 'Johannesburg, South Africa', '0117654026', 'info@goldengem.co.za', 'https://goldengem.co.za',
    'https://images.pexels.com/photos/691046/pexels-photo-691046.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.8
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, '18k Gold Necklace', 'Handcrafted 18k gold necklace, 45cm.', 'R8,500', 'https://images.pexels.com/photos/691046/pexels-photo-691046.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Diamond Engagement Ring', 'Certified 0.5 carat diamond, 18k white gold band.', 'R25,000', 'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Silver Bracelet', 'Sterling silver chain bracelet.', 'R1,200', 'https://images.pexels.com/photos/691046/pexels-photo-691046.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 27. Comfort Living Furniture — Furniture & Home — Nairobi -----------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Comfort Living Furniture', 'comfort-living-furniture',
    'A Nairobi furniture showroom offering quality sofas, dining sets and bedroom furniture, with delivery across the city.',
    'Furniture & Home', 'Nairobi, Kenya', '0778901027', 'sales@comfortliving.ke', 'https://comfortliving.ke',
    'https://images.pexels.com/photos/1866149/pexels-photo-1866149.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/276724/pexels-photo-276724.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.4
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, '3-Seater Sofa', 'Upholstered fabric sofa, available in 4 colors.', 'KSh 45,000', 'https://images.pexels.com/photos/1866149/pexels-photo-1866149.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Dining Table Set (6 seats)', 'Solid wood dining table with 6 matching chairs.', 'KSh 38,000', 'https://images.pexels.com/photos/276724/pexels-photo-276724.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Queen Bed Frame', 'Wooden queen-size bed frame with headboard.', 'KSh 22,000', 'https://images.pexels.com/photos/1866149/pexels-photo-1866149.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 28. Fresh Market Grocers — Grocery / Mini-Mart — Lagos --------------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'Fresh Market Grocers', 'fresh-market-grocers',
    'A neighborhood mini-mart in Lagos stocking groceries, fresh produce and household essentials at fair prices.',
    'Grocery / Mini-Mart', 'Lagos, Nigeria', '08023450028', 'orders@freshmarketng.com', null,
    'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/1005638/pexels-photo-1005638.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', false, 4.0
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_products WHERE business_id = biz_id;
  INSERT INTO business_products (business_id, name, description, price, image_url) VALUES
    (biz_id, 'Rice (50kg Bag)', 'Premium long-grain parboiled rice.', '₦65,000', 'https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Cooking Oil (5L)', 'Pure vegetable cooking oil.', '₦12,500', 'https://images.pexels.com/photos/1005638/pexels-photo-1005638.jpeg?auto=compress&cs=tinysrgb&w=640'),
    (biz_id, 'Fresh Vegetable Basket', 'Assorted fresh vegetables, sourced daily.', '₦5,000', 'https://images.pexels.com/photos/3962285/pexels-photo-3962285.jpeg?auto=compress&cs=tinysrgb&w=640');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 29. QuickCash Transfer Services — Money Transfer / Mobile Money Agent — Kampala
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'QuickCash Transfer Services', 'quickcash-transfer-services',
    'A licensed Kampala money transfer and mobile money agent handling international remittances, deposits and bill payments.',
    'Money Transfer / Mobile Money Agent', 'Kampala, Uganda', '0772345029', 'support@quickcashug.com', null,
    'https://images.pexels.com/photos/4386321/pexels-photo-4386321.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/4968630/pexels-photo-4968630.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.3
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'International Money Transfer', 'Send or receive money abroad via Western Union and MoneyGram.', 'USh 5,000 flat fee'),
    (biz_id, 'Mobile Money Deposit/Withdrawal', 'Cash deposit or withdrawal to any mobile money wallet.', 'USh 1,000'),
    (biz_id, 'Bill Payment Service', 'Pay utility, TV and school fee bills in person.', 'USh 500');

END $$;

DO $$
DECLARE
  biz_id uuid;
BEGIN
  -- 30. BrightPath Learning Centre — Training & Tutoring — Lagos --------
  INSERT INTO businesses (name, username, description, category, location, phone, email, website, image_url, logo_url, status, verified, rating)
  VALUES (
    'BrightPath Learning Centre', 'brightpath-learning-centre',
    'A Lagos tutoring and skills center offering WAEC/JAMB prep, coding bootcamps and adult literacy classes.',
    'Training & Tutoring', 'Lagos, Nigeria', '08034560030', 'learn@brightpathng.com', 'https://brightpathng.com',
    'https://images.pexels.com/photos/256541/pexels-photo-256541.jpeg?auto=compress&cs=tinysrgb&w=640',
    'https://images.pexels.com/photos/301926/pexels-photo-301926.jpeg?auto=compress&cs=tinysrgb&w=640',
    'open', true, 4.6
  )
  ON CONFLICT ((lower(username))) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, location = EXCLUDED.location,
    phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
    image_url = EXCLUDED.image_url, logo_url = EXCLUDED.logo_url, status = EXCLUDED.status,
    verified = EXCLUDED.verified, rating = EXCLUDED.rating, updated_at = now()
  RETURNING id INTO biz_id;

  DELETE FROM business_services WHERE business_id = biz_id;
  INSERT INTO business_services (business_id, name, description, price) VALUES
    (biz_id, 'WAEC/JAMB Tutorial (per subject/month)', 'Small-group tutoring for major WAEC/JAMB subjects.', '₦15,000'),
    (biz_id, 'Coding Bootcamp (8 weeks)', 'Beginner-friendly web development bootcamp.', '₦120,000'),
    (biz_id, 'Adult Literacy Classes (per month)', 'Reading, writing and numeracy classes for adults.', '₦8,000');

END $$;
