/*
  # NowOpen Live — premium livestreaming for verified businesses

  Adds the schema behind the new "🔴 Live" section on business profiles:
  owners broadcast from a browser (desktop/mobile camera, WebRTC — signaled
  over Supabase Realtime, no third-party streaming account required), viewers
  watch, chat, get AI captions/translation, and owners see replay + analytics
  afterwards.

  1. business_streams — one row per broadcast (scheduled, live, or ended).
     Only verified businesses may create rows here (enforced in the owner
     policy below) — this is a premium/verified-only feature.
  2. stream_chat_messages — public live chat per stream, owner-moderatable.
  3. stream_captions — persisted caption lines (source language), used for
     live display fallback and replay; live-viewer captions are primarily
     pushed over a Realtime broadcast channel for zero-latency, but are also
     written here so replays and translation-on-demand have something to
     read.
  4. stream_followers — "Notify Me" / "Follow Live" interest capture for
     offline businesses. No email-sending infrastructure is wired up in this
     project yet, so this only *captures* interest — it doesn't dispatch
     notifications on its own.
  5. stream_blocked_senders — lets an owner block a disruptive chat
     participant (by their client-generated session id) from a business's
     streams.
*/

CREATE TABLE IF NOT EXISTS business_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Live now',
  description text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_for timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  current_viewers int NOT NULL DEFAULT 0,
  peak_viewers int NOT NULL DEFAULT 0,
  total_viewers int NOT NULL DEFAULT 0,
  chat_message_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES business_streams(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  sender_session text NOT NULL,
  message text NOT NULL,
  is_owner boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_captions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES business_streams(id) ON DELETE CASCADE,
  text text NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email text,
  session_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, session_id)
);

CREATE TABLE IF NOT EXISTS stream_blocked_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, session_id)
);

ALTER TABLE business_streams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_captions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_followers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_blocked_senders  ENABLE ROW LEVEL SECURITY;

-- ── business_streams: public read, verified owner (or admin) manages ──
DROP POLICY IF EXISTS "Public can view streams" ON business_streams;
CREATE POLICY "Public can view streams" ON business_streams
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Verified owners manage streams" ON business_streams;
CREATE POLICY "Verified owners manage streams" ON business_streams
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
    AND (b.verified = true OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
    AND (b.verified = true OR public.is_admin())
  ));

-- ── stream_chat_messages: anyone can post/read, owner (or admin) moderates ──
DROP POLICY IF EXISTS "Anyone can view stream chat" ON stream_chat_messages;
CREATE POLICY "Anyone can view stream chat" ON stream_chat_messages
  FOR SELECT USING (true);

-- Blocked senders are rejected at insert time (not just hidden client-side)
-- by checking stream_blocked_senders against NEW.sender_session.
DROP POLICY IF EXISTS "Anyone can post stream chat" ON stream_chat_messages;
CREATE POLICY "Anyone can post stream chat" ON stream_chat_messages
  FOR INSERT TO anon, authenticated WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM stream_blocked_senders bs
      JOIN business_streams s ON s.business_id = bs.business_id
      WHERE s.id = stream_id AND bs.session_id = sender_session
    )
  );

DROP POLICY IF EXISTS "Owners moderate stream chat" ON stream_chat_messages;
CREATE POLICY "Owners moderate stream chat" ON stream_chat_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM business_streams s JOIN businesses b ON b.id = s.business_id
    WHERE s.id = stream_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM business_streams s JOIN businesses b ON b.id = s.business_id
    WHERE s.id = stream_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

DROP POLICY IF EXISTS "Owners delete stream chat" ON stream_chat_messages;
CREATE POLICY "Owners delete stream chat" ON stream_chat_messages
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM business_streams s JOIN businesses b ON b.id = s.business_id
    WHERE s.id = stream_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

-- ── stream_captions: public read, verified owner writes while broadcasting ──
DROP POLICY IF EXISTS "Public can view captions" ON stream_captions;
CREATE POLICY "Public can view captions" ON stream_captions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners write captions" ON stream_captions;
CREATE POLICY "Owners write captions" ON stream_captions
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM business_streams s JOIN businesses b ON b.id = s.business_id
    WHERE s.id = stream_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

-- ── stream_followers: anyone can follow, only the owner (or admin) reads (contains emails) ──
DROP POLICY IF EXISTS "Anyone can follow a business" ON stream_followers;
CREATE POLICY "Anyone can follow a business" ON stream_followers
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Owners read followers" ON stream_followers;
CREATE POLICY "Owners read followers" ON stream_followers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

-- ── stream_blocked_senders: owner-only, both ways ──
DROP POLICY IF EXISTS "Owners manage blocklist" ON stream_blocked_senders;
CREATE POLICY "Owners manage blocklist" ON stream_blocked_senders
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

-- Keep business_streams.chat_message_count in sync so dashboard analytics
-- don't need a separate count(*) query per stream.
CREATE OR REPLACE FUNCTION public.bump_stream_chat_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE business_streams SET chat_message_count = chat_message_count + 1 WHERE id = NEW.stream_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_stream_chat_count ON stream_chat_messages;
CREATE TRIGGER trg_bump_stream_chat_count
  AFTER INSERT ON stream_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_stream_chat_count();
