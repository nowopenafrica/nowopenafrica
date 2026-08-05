/*
  # Input length limits on public-insertable text fields

  Every text/textarea in the app already caps input length client-side, but
  that's UX only — a direct REST call (bypassing the frontend entirely) can
  still stuff an arbitrarily large payload into any of these unbounded
  `text`/`jsonb` columns, since nothing in RLS constrains value *size*, only
  *access*. This adds DB-level CHECK constraints so oversized rows are
  rejected outright, regardless of how the insert was made — the same
  defense-in-depth idea as the existing
  `business_bookings_items_is_array` constraint.

  Limits are generous (well above any legitimate use) rather than tight,
  since the goal is stopping abuse/storage-bloat, not restricting real input.
*/

-- ── business_enquiries ──
ALTER TABLE business_enquiries DROP CONSTRAINT IF EXISTS business_enquiries_length_limits;
ALTER TABLE business_enquiries ADD CONSTRAINT business_enquiries_length_limits CHECK (
  char_length(name) <= 200
  AND char_length(email) <= 320
  AND (phone IS NULL OR char_length(phone) <= 30)
  AND char_length(message) <= 5000
  AND (context IS NULL OR char_length(context) <= 300)
);

-- ── business_reviews ──
ALTER TABLE business_reviews DROP CONSTRAINT IF EXISTS business_reviews_length_limits;
ALTER TABLE business_reviews ADD CONSTRAINT business_reviews_length_limits CHECK (
  char_length(author_name) <= 200
  AND (comment IS NULL OR char_length(comment) <= 2000)
);

-- ── business_bookings ──
ALTER TABLE business_bookings DROP CONSTRAINT IF EXISTS business_bookings_length_limits;
ALTER TABLE business_bookings ADD CONSTRAINT business_bookings_length_limits CHECK (
  char_length(customer_name) <= 200
  AND char_length(customer_email) <= 320
  AND (customer_phone IS NULL OR char_length(customer_phone) <= 30)
  AND (notes IS NULL OR char_length(notes) <= 2000)
  AND (item_name IS NULL OR char_length(item_name) <= 300)
  AND (item_price IS NULL OR char_length(item_price) <= 100)
  AND (items IS NULL OR octet_length(items::text) <= 20000)
);

-- ── business_streams (owner-authenticated, but cheap defense-in-depth) ──
ALTER TABLE business_streams DROP CONSTRAINT IF EXISTS business_streams_length_limits;
ALTER TABLE business_streams ADD CONSTRAINT business_streams_length_limits CHECK (
  char_length(title) <= 200
  AND (description IS NULL OR char_length(description) <= 2000)
);

-- ── stream_chat_messages ──
ALTER TABLE stream_chat_messages DROP CONSTRAINT IF EXISTS stream_chat_messages_length_limits;
ALTER TABLE stream_chat_messages ADD CONSTRAINT stream_chat_messages_length_limits CHECK (
  char_length(sender_name) <= 100
  AND char_length(message) <= 500
);

-- ── stream_captions ──
ALTER TABLE stream_captions DROP CONSTRAINT IF EXISTS stream_captions_length_limits;
ALTER TABLE stream_captions ADD CONSTRAINT stream_captions_length_limits CHECK (
  char_length(text) <= 1000
);

-- ── stream_followers ──
ALTER TABLE stream_followers DROP CONSTRAINT IF EXISTS stream_followers_length_limits;
ALTER TABLE stream_followers ADD CONSTRAINT stream_followers_length_limits CHECK (
  email IS NULL OR char_length(email) <= 320
);
