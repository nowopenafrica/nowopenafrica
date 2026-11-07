-- Brand social: NowOpen Africa's OWN social accounts, published through Zoho.
--
-- Not to be confused with social_scheduled_posts, which is the queue a
-- *business on the platform* uses to post to *its own* accounts through each
-- network's API. This is the founder's channel: the official @nowopenafrica
-- accounts, which already live in Zoho Social (audited 2026-10-28: 10 channels
-- connected, a team member posting there daily).
--
-- Zoho Social has no public API. The supported route is Zoho Flow: a webhook
-- trigger feeding its "Draft post" / "Schedule post" actions. So nothing here
-- talks to Instagram or Facebook directly; the edge function brand-social-
-- dispatch hands an APPROVED post to a Flow webhook and records what Flow said.
--
-- Rules this schema enforces, not just the UI:
--   * Only admins see or touch any of it (posting as the brand is the founder's
--     call; editors have no reason to be here).
--   * Nothing leaves without a person's approval. A post can only be sent once
--     status = 'approved' and approved_by is set, and only the service role
--     (the dispatcher) may move it past 'approved'.
--   * Every decision is written to brand_social_audit by trigger, so the trail
--     cannot be skipped by a client that forgets to log.
--   * Every metric carries its source and period. There is no column for a
--     number without one.

-- ── Settings (one row) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_social_settings (
  id             boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- draft: plan only, nothing is sent.  approval: a person approves each post
  -- before it goes to Zoho.  automation: reserved; the dispatcher refuses it
  -- until a full round trip has been tested (see brand-social-dispatch).
  autonomy_mode  text NOT NULL DEFAULT 'approval'
                 CHECK (autonomy_mode IN ('draft','approval','automation')),
  -- What Zoho Flow is asked to do with an approved post. 'draft' until the
  -- founder has watched drafts arrive correctly; 'schedule' after that.
  zoho_action    text NOT NULL DEFAULT 'draft' CHECK (zoho_action IN ('draft','schedule')),
  timezone       text NOT NULL DEFAULT 'Africa/Lagos',
  -- Ceiling on brand posts per channel per Lagos day, including ones the team
  -- schedules by hand in Zoho (they are entered as external rows).
  daily_limit_per_channel int NOT NULL DEFAULT 3 CHECK (daily_limit_per_channel BETWEEN 1 AND 20),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.brand_social_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ── Channels, as connected in Zoho ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_social_channels (
  id          text PRIMARY KEY,            -- instagram, facebook, x, ...
  label       text NOT NULL,
  handle      text NOT NULL,               -- exactly as Zoho shows it
  connected   boolean NOT NULL DEFAULT true,
  active      boolean NOT NULL DEFAULT true, -- false = connected but not posting to
  sort        int NOT NULL DEFAULT 100,
  verified_at timestamptz,
  note        text
);

-- Read from Zoho Social → Brand settings → Social channels on 2026-10-28.
INSERT INTO public.brand_social_channels (id, label, handle, sort, verified_at, note) VALUES
  ('instagram',         'Instagram',             'nowopenafrica',  10, '2026-10-28', NULL),
  ('facebook',          'Facebook Page',         'NowOpen',        20, '2026-10-28', NULL),
  ('tiktok',            'TikTok',                'nowopen.africa', 30, '2026-10-28', 'The website links to @nowopenafrica; Zoho is connected to @nowopen.africa.'),
  ('linkedin_company',  'LinkedIn Company Page', 'NowOpen Africa', 40, '2026-10-28', NULL),
  ('linkedin_profile',  'LinkedIn Profile',      'NowOpen Africa', 45, '2026-10-28', NULL),
  ('x',                 'X',                     'nowopenafrica',  50, '2026-10-28', NULL),
  ('threads',           'Threads',               'nowopenafrica',  60, '2026-10-28', NULL),
  ('youtube',           'YouTube',               'NowOpen Africa', 70, '2026-10-28', NULL),
  ('pinterest',         'Pinterest',             'nowopenafrica',  80, '2026-10-28', NULL),
  ('whatsapp',          'WhatsApp Business',     'NowOpen Africa', 90, '2026-10-28', 'Connected in Zoho; brand posting to WhatsApp is not a feed, so it starts inactive.')
ON CONFLICT (id) DO NOTHING;
UPDATE public.brand_social_channels SET active = false WHERE id = 'whatsapp' AND verified_at = '2026-10-28';

-- ── Brand profile, versioned ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_social_profile (
  version     int PRIMARY KEY,
  profile     jsonb NOT NULL,
  note        text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.brand_social_profile (version, profile, note) VALUES (1, $json${
  "positioning": "NowOpen Africa is where African businesses, services, products, advertising opportunities and creative capabilities can be discovered in one place.",
  "products": {
    "business": "Discover businesses, showcase profiles, and help owners add, claim and manage their listing.",
    "promote": "Discover advertising opportunities and plan campaigns.",
    "create_media": "Access creative services and produce promotional materials."
  },
  "lines": [
    "AFRICA is NOWOPEN.",
    "Your business deserves to be found.",
    "Discover customers. Find businesses.",
    "Advertise everywhere. Create anything.",
    "Make African businesses easier to discover."
  ],
  "main_cta": "Add your business",
  "pillars": [
    {"id": "spotlights",  "label": "Business spotlights",               "purpose": "Make African businesses feel seen and encourage profile claims"},
    {"id": "discovery",   "label": "Discovery demonstrations",          "purpose": "Show how people find businesses, products and services"},
    {"id": "founder",     "label": "Founder story and mission",         "purpose": "Build trust and make the vision memorable"},
    {"id": "education",   "label": "Practical business education",      "purpose": "Give business owners useful reasons to follow"},
    {"id": "creative",    "label": "Advertising and creative showcases","purpose": "Demonstrate Promote and Create Media use cases"},
    {"id": "community",   "label": "Community campaigns and launches",  "purpose": "Drive registrations, participation and sharing"}
  ],
  "audiences": [
    {"id": "owners",     "label": "African business owners"},
    {"id": "smb",        "label": "Small and growing businesses"},
    {"id": "consumers",  "label": "Consumers discovering businesses"},
    {"id": "advertisers","label": "Advertisers and media buyers"},
    {"id": "creatives",  "label": "Creative professionals and service providers"},
    {"id": "partners",   "label": "Partners and ecosystem supporters"}
  ],
  "objectives": ["awareness", "engagement", "website_visits", "registrations", "claims", "advertiser_enquiries"],
  "honesty_rules": [
    "No invented statistics, user counts, testimonials, partners, rewards or launch claims.",
    "Anything unverified stays as a [bracket] placeholder and blocks sending.",
    "Photo mock-ups are labelled COMP. No generated founder likeness."
  ]
}$json$, 'Founder brief, 2026-10-28') ON CONFLICT (version) DO NOTHING;

-- ── Campaigns ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_social_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  name        text NOT NULL,
  objective   text NOT NULL,
  starts_on   date,
  ends_on     date,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','done')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.brand_social_campaigns (slug, name, objective, starts_on, ends_on) VALUES
  ('nov3-unveiling', 'Nov 3 unveiling', 'awareness', '2026-10-28', '2026-11-10'),
  ('always-on',      'Always on',       'registrations', NULL, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ── Content ────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.brand_social_code_seq;

CREATE TABLE IF NOT EXISTS public.brand_social_content (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE
                  DEFAULT 'NOA-SOC-' || lpad(nextval('public.brand_social_code_seq')::text, 4, '0'),
  campaign_id     uuid REFERENCES public.brand_social_campaigns(id) ON DELETE SET NULL,
  pillar          text NOT NULL,
  audience        text NOT NULL,
  objective       text NOT NULL,
  hook            text,
  caption         text NOT NULL,          -- the master caption; variants adapt it
  creative_brief  text,
  media_url       text,                   -- the finished asset, never a placeholder
  cta             text,
  destination_url text,
  evidence        text,                   -- where any factual claim comes from
  -- Sensitive posts (announcements, pricing, partners, responses...) are
  -- flagged by the checker or by hand and can never be automated.
  sensitive       boolean NOT NULL DEFAULT false,
  planned_at      timestamptz,            -- stored UTC, shown in Lagos time
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','in_review','approved','rejected','cancelled',
                                    'sending','sent','failed')),
  review_note     text,
  approved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_social_content_status ON public.brand_social_content (status, planned_at);

-- One row per channel a post goes to. The caption is the channel's own
-- version, not a blind copy of the master.
CREATE TABLE IF NOT EXISTS public.brand_social_variants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id    uuid NOT NULL REFERENCES public.brand_social_content(id) ON DELETE CASCADE,
  channel       text NOT NULL REFERENCES public.brand_social_channels(id),
  caption       text NOT NULL,
  tracked_url   text,                     -- destination with UTM tags
  checks        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- last checker output
  -- pending → sending → sent | failed.  'sent' means Zoho Flow ACCEPTED it;
  -- zoho_confirmed_at is set only when Flow calls back after the Zoho action.
  dispatch_status text NOT NULL DEFAULT 'pending'
                  CHECK (dispatch_status IN ('pending','sending','sent','failed')),
  dispatch_key  text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,  -- idempotency key sent to Flow
  attempts      int NOT NULL DEFAULT 0,
  last_error    text,
  sent_at       timestamptz,
  zoho_reference text,
  zoho_confirmed_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, channel)
);

-- Posts the team schedules by hand in Zoho, entered so the daily limit and
-- the duplicate check see the whole calendar, not just what this tool made.
CREATE TABLE IF NOT EXISTS public.brand_social_external_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     text NOT NULL REFERENCES public.brand_social_channels(id),
  posted_at   timestamptz NOT NULL,
  caption     text NOT NULL,
  source      text NOT NULL DEFAULT 'Zoho Social (entered by hand)',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Audit trail ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brand_social_audit (
  id          bigserial PRIMARY KEY,
  content_id  uuid REFERENCES public.brand_social_content(id) ON DELETE CASCADE,
  variant_id  uuid REFERENCES public.brand_social_variants(id) ON DELETE CASCADE,
  action      text NOT NULL,
  actor       uuid,                        -- null = the dispatcher (service role)
  detail      jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_social_audit_content ON public.brand_social_audit (content_id, at DESC);

-- ── Metrics: every number carries its source and period ────────────────────
CREATE TABLE IF NOT EXISTS public.brand_social_metrics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       text NOT NULL REFERENCES public.brand_social_channels(id),
  metric        text NOT NULL CHECK (metric IN ('followers','new_followers','posts','reach','engagements','impressions','link_clicks','video_views')),
  value         numeric NOT NULL CHECK (value >= 0),
  period_start  date NOT NULL,
  period_end    date NOT NULL CHECK (period_end >= period_start),
  source        text NOT NULL CHECK (length(trim(source)) > 0),
  captured_at   timestamptz NOT NULL DEFAULT now(),
  captured_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (channel, metric, period_start, period_end, source)
);

-- Baseline read from Zoho Social → Home → Brand Health ("past 30 days") on
-- 2026-10-28. Zoho showed NA for reach on X, LinkedIn, TikTok and Threads;
-- those are absent here, not zero.
INSERT INTO public.brand_social_metrics (channel, metric, value, period_start, period_end, source, captured_at) VALUES
  ('facebook','followers',87,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('facebook','new_followers',0,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('facebook','posts',5,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('facebook','reach',8,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('facebook','engagements',1,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('x','followers',1,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('x','posts',4,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('x','engagements',0,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('linkedin_profile','followers',0,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('linkedin_profile','posts',4,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('linkedin_profile','engagements',0,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('instagram','followers',91,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('instagram','new_followers',4,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('instagram','posts',30,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('instagram','reach',259,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('instagram','engagements',36,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('youtube','followers',2,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('youtube','posts',20,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('youtube','reach',3,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('youtube','engagements',0,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('tiktok','followers',5,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('tiktok','posts',24,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('tiktok','engagements',42,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('threads','followers',14,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('threads','posts',5,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28'),
  ('threads','engagements',0,'2026-09-28','2026-10-28','Zoho Social Brand Health','2026-10-28')
ON CONFLICT (channel, metric, period_start, period_end, source) DO NOTHING;

-- ── Access: admins only, everywhere ────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_social_settings','brand_social_channels','brand_social_profile',
                           'brand_social_campaigns','brand_social_content','brand_social_variants',
                           'brand_social_external_posts','brand_social_audit','brand_social_metrics']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins manage %s" ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t, t);
  END LOOP;
END $$;

-- The audit trail is append-only for people: no edits, no deletes.
DROP POLICY IF EXISTS "Admins manage brand_social_audit" ON public.brand_social_audit;
DROP POLICY IF EXISTS "Admins read brand_social_audit" ON public.brand_social_audit;
CREATE POLICY "Admins read brand_social_audit" ON public.brand_social_audit
  FOR SELECT TO authenticated USING (public.is_admin());

-- ── Guards ─────────────────────────────────────────────────────────────────
-- People decide; the dispatcher reports. A person may move content between
-- draft / in_review / approved / rejected / cancelled, and may put a failed
-- post back to approved for another try. Only the service role (auth.uid() is
-- null) may set sending / sent / failed, and approving stamps who and when.
CREATE OR REPLACE FUNCTION public.guard_brand_social_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','in_review') THEN NEW.status := 'draft'; END IF;
    NEW.approved_by := NULL; NEW.approved_at := NULL;
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('sending','sent','failed') THEN
      RAISE EXCEPTION 'Only the dispatcher can mark a post %', NEW.status;
    END IF;
    IF OLD.status IN ('sending','sent') THEN
      RAISE EXCEPTION 'This post has already gone to Zoho and cannot be changed here';
    END IF;
    IF NEW.status = 'approved' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    ELSE
      NEW.approved_by := NULL; NEW.approved_at := NULL;
    END IF;
  ELSE
    -- No silent re-approval by editing the stamp.
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
  END IF;

  -- Editing an approved post's words or media sends it back to review: what
  -- was approved is what goes out, never something changed afterwards.
  IF OLD.status = 'approved' AND NEW.status = 'approved'
     AND (NEW.caption IS DISTINCT FROM OLD.caption OR NEW.media_url IS DISTINCT FROM OLD.media_url
          OR NEW.destination_url IS DISTINCT FROM OLD.destination_url OR NEW.planned_at IS DISTINCT FROM OLD.planned_at) THEN
    NEW.status := 'in_review'; NEW.approved_by := NULL; NEW.approved_at := NULL;
  END IF;

  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_brand_social_content ON public.brand_social_content;
CREATE TRIGGER trg_guard_brand_social_content
  BEFORE INSERT OR UPDATE ON public.brand_social_content
  FOR EACH ROW EXECUTE FUNCTION public.guard_brand_social_content();

CREATE OR REPLACE FUNCTION public.guard_brand_social_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_status text;
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO parent_status FROM public.brand_social_content WHERE id = NEW.content_id;
  IF parent_status IN ('sending','sent') THEN
    RAISE EXCEPTION 'This post has already gone to Zoho and cannot be changed here';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.dispatch_status := 'pending'; NEW.attempts := 0; NEW.last_error := NULL;
    NEW.sent_at := NULL; NEW.zoho_reference := NULL; NEW.zoho_confirmed_at := NULL;
    -- A channel added after approval was never approved: back to review.
    IF parent_status = 'approved' THEN
      UPDATE public.brand_social_content SET status = 'in_review' WHERE id = NEW.content_id;
    END IF;
    RETURN NEW;
  END IF;

  NEW.dispatch_status   := OLD.dispatch_status;
  NEW.dispatch_key      := OLD.dispatch_key;
  NEW.attempts          := OLD.attempts;
  NEW.last_error        := OLD.last_error;
  NEW.sent_at           := OLD.sent_at;
  NEW.zoho_reference    := OLD.zoho_reference;
  NEW.zoho_confirmed_at := OLD.zoho_confirmed_at;

  -- A channel caption changed after approval: the whole post goes back to review.
  IF parent_status = 'approved' AND NEW.caption IS DISTINCT FROM OLD.caption THEN
    UPDATE public.brand_social_content SET status = 'in_review' WHERE id = NEW.content_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_brand_social_variant ON public.brand_social_variants;
CREATE TRIGGER trg_guard_brand_social_variant
  BEFORE INSERT OR UPDATE ON public.brand_social_variants
  FOR EACH ROW EXECUTE FUNCTION public.guard_brand_social_variant();

-- ── Audit by trigger, so it cannot be skipped ──────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_brand_social_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.brand_social_audit (content_id, action, actor, detail)
    VALUES (NEW.id, 'created', auth.uid(), jsonb_build_object('status', NEW.status, 'code', NEW.code));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.brand_social_audit (content_id, action, actor, detail)
    VALUES (NEW.id, NEW.status, auth.uid(), jsonb_build_object('from', OLD.status, 'note', NEW.review_note));
  ELSIF NEW.caption IS DISTINCT FROM OLD.caption OR NEW.media_url IS DISTINCT FROM OLD.media_url
        OR NEW.planned_at IS DISTINCT FROM OLD.planned_at THEN
    INSERT INTO public.brand_social_audit (content_id, action, actor, detail)
    VALUES (NEW.id, 'edited', auth.uid(), NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_brand_social_content ON public.brand_social_content;
CREATE TRIGGER trg_audit_brand_social_content
  AFTER INSERT OR UPDATE ON public.brand_social_content
  FOR EACH ROW EXECUTE FUNCTION public.audit_brand_social_content();

CREATE OR REPLACE FUNCTION public.audit_brand_social_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.dispatch_status IS DISTINCT FROM OLD.dispatch_status
     OR NEW.zoho_confirmed_at IS DISTINCT FROM OLD.zoho_confirmed_at THEN
    INSERT INTO public.brand_social_audit (content_id, variant_id, action, actor, detail)
    VALUES (NEW.content_id, NEW.id,
            CASE WHEN NEW.zoho_confirmed_at IS DISTINCT FROM OLD.zoho_confirmed_at THEN 'zoho_confirmed'
                 ELSE 'dispatch_' || NEW.dispatch_status END,
            auth.uid(),
            jsonb_build_object('channel', NEW.channel, 'error', NEW.last_error, 'zoho_reference', NEW.zoho_reference));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_brand_social_variant ON public.brand_social_variants;
CREATE TRIGGER trg_audit_brand_social_variant
  AFTER UPDATE ON public.brand_social_variants
  FOR EACH ROW EXECUTE FUNCTION public.audit_brand_social_variant();
