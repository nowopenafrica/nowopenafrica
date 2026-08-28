/*
  # Sending to the people who keep you

  business_keeps captures permission. This is the half that uses it.

  WHY THIS IS IN THE DATABASE AND NOT THE APP

  notifications' insert policy is `is_admin() OR auth.uid() = user_id` — a
  business owner cannot write a notification for somebody else, and should not
  be able to. So the fan-out cannot happen in the browser. A SECURITY DEFINER
  function is the honest place: it runs server-side, it cannot be called with
  someone else's identity, and it fires no matter which client caused the event.

  1. `keep_sends` — one row per send, per business, per topic. This is the
     throttle's memory, and the throttle is not optional: a shop adding twenty
     products in one sitting would otherwise put twenty notifications in every
     keeper's list and lose the audience it just built.

  2. `notify_keepers(...)` — the fan-out. Respects the topics each person
     agreed to, skips the owner's own account, and refuses to send twice inside
     the topic's window.

  3. `send_keep_update(...)` — what an owner calls for a promotion or an
     announcement, which have no table to trigger from. Verifies the caller
     actually owns the business.

  4. Triggers for the four events that DO have a source: a new product, a new
     branch, a scheduled or live stream, and the shop opening.

  Re-runnable: CREATE OR REPLACE for functions, DROP TRIGGER IF EXISTS before
  each trigger, IF NOT EXISTS for the table and its indexes.
*/

-- 1. Throttle memory ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.keep_sends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  topic       text NOT NULL,
  recipients  integer NOT NULL DEFAULT 0,
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keep_sends_business_topic
  ON public.keep_sends (business_id, topic, sent_at DESC);

ALTER TABLE public.keep_sends ENABLE ROW LEVEL SECURITY;

-- Owners can see what has been sent on their behalf, and when the next one is
-- allowed. Nobody else needs this at all.
DROP POLICY IF EXISTS "Owners read their keep sends" ON public.keep_sends;
CREATE POLICY "Owners read their keep sends" ON public.keep_sends
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id
      AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

-- 2. How long a topic must wait between sends -----------------------------------

/*
  Deliberately different per topic, because the events differ in how often they
  legitimately happen and how much a person wants to hear about each.

  A shop opens every single day, so `openings` is the one that would become
  noise fastest — twelve hours means at most one "we're open" a day, never two.
  A product drop is a batch: six hours turns an afternoon of stocking into one
  notification. A new branch is rare and worth its own message. An event is
  time-sensitive, so it gets the shortest wait.
*/
CREATE OR REPLACE FUNCTION public.keep_topic_window(p_topic text)
RETURNS interval
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_topic
    WHEN 'openings'      THEN interval '12 hours'
    WHEN 'products'      THEN interval '6 hours'
    WHEN 'events'        THEN interval '1 hour'
    WHEN 'locations'     THEN interval '24 hours'
    WHEN 'promotions'    THEN interval '6 hours'
    WHEN 'announcements' THEN interval '6 hours'
    ELSE interval '6 hours'
  END;
$$;

-- 3. The fan-out -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_keepers(
  p_business_id uuid,
  p_topic       text,
  p_title       text,
  p_body        text,
  p_link        text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_count integer := 0;
BEGIN
  IF p_business_id IS NULL OR p_topic IS NULL OR coalesce(p_title, '') = '' THEN
    RETURN 0;
  END IF;

  -- Silence rather than a duplicate. Returning 0 lets a caller tell the owner
  -- "already sent recently" instead of pretending it went out.
  IF EXISTS (
    SELECT 1 FROM public.keep_sends s
    WHERE s.business_id = p_business_id
      AND s.topic = p_topic
      AND s.sent_at > now() - public.keep_topic_window(p_topic)
  ) THEN
    RETURN 0;
  END IF;

  SELECT b.user_id INTO v_owner FROM public.businesses b WHERE b.id = p_business_id;

  INSERT INTO public.notifications (user_id, title, body, type, link)
  SELECT k.user_id, p_title, p_body, 'keep', p_link
  FROM public.business_keeps k
  WHERE k.business_id = p_business_id
    AND p_topic = ANY (k.topics)
    -- An owner who keeps their own business should not be told about their own
    -- actions; they just performed them.
    AND (v_owner IS NULL OR k.user_id <> v_owner);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Recorded even when nobody was reached, so the window still applies. An
  -- event with no audience yet must not leave the door open for a burst later.
  INSERT INTO public.keep_sends (business_id, topic, recipients)
  VALUES (p_business_id, p_topic, v_count);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_keepers(uuid, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.notify_keepers(uuid, text, text, text, text) FROM anon, authenticated;

-- 4. What an owner may send by hand ----------------------------------------------

/*
  Promotions and announcements have no table to trigger from, so the owner sends
  them. Ownership is checked HERE rather than trusted from the client, because
  notify_keepers is SECURITY DEFINER and would otherwise let any signed-in user
  message any business's audience.
*/
CREATE OR REPLACE FUNCTION public.send_keep_update(
  p_business_id uuid,
  p_topic       text,
  p_title       text,
  p_body        text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_link text;
BEGIN
  IF p_topic NOT IN ('promotions', 'announcements', 'events', 'products') THEN
    RAISE EXCEPTION 'Topic % cannot be sent by hand', p_topic;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = p_business_id
      AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ) THEN
    RAISE EXCEPTION 'Not your business';
  END IF;

  SELECT coalesce(b.username, b.id::text) INTO v_slug
  FROM public.businesses b WHERE b.id = p_business_id;
  v_link := '/' || v_slug;

  RETURN public.notify_keepers(p_business_id, p_topic, p_title, left(coalesce(p_body, ''), 400), v_link);
END;
$$;

REVOKE ALL ON FUNCTION public.send_keep_update(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.send_keep_update(uuid, text, text, text) TO authenticated;

-- 5. The events that trigger themselves -------------------------------------------

/*
  A NOTE ON THE EXCEPTION BLOCKS BELOW

  These triggers run INSIDE the owner's transaction. Without a guard, anything
  that makes notify_keepers raise — a constraint, a deleted user, a schema drift
  between this repo and live — would roll back the write that fired it, and the
  owner would see "could not add product" with no clue why. A missed
  notification is a small loss; a shop that cannot add stock is a broken
  product. So every trigger swallows its own failure and warns to the log.
*/

CREATE OR REPLACE FUNCTION public.keep_notify_new_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_slug text;
BEGIN
  SELECT b.name, coalesce(b.username, b.id::text) INTO v_name, v_slug
  FROM public.businesses b WHERE b.id = NEW.business_id;
  BEGIN
    PERFORM public.notify_keepers(
      NEW.business_id, 'products',
      v_name || ' added something new',
      NEW.name, '/' || v_slug);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'keep notify (products) failed for %: %', NEW.business_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_new_product ON public.business_products;
CREATE TRIGGER trg_keep_new_product
  AFTER INSERT ON public.business_products
  FOR EACH ROW EXECUTE FUNCTION public.keep_notify_new_product();

CREATE OR REPLACE FUNCTION public.keep_notify_new_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_slug text;
BEGIN
  SELECT b.name, coalesce(b.username, b.id::text) INTO v_name, v_slug
  FROM public.businesses b WHERE b.id = NEW.business_id;
  BEGIN
    PERFORM public.notify_keepers(
      NEW.business_id, 'locations',
      v_name || ' opened a new branch',
      coalesce(NEW.name, '') || coalesce(' — ' || NEW.address, ''), '/' || v_slug);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'keep notify (locations) failed for %: %', NEW.business_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_new_location ON public.business_locations;
CREATE TRIGGER trg_keep_new_location
  AFTER INSERT ON public.business_locations
  FOR EACH ROW EXECUTE FUNCTION public.keep_notify_new_location();

CREATE OR REPLACE FUNCTION public.keep_notify_stream()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_slug text;
BEGIN
  IF NEW.status NOT IN ('scheduled', 'live') THEN RETURN NEW; END IF;
  SELECT b.name, coalesce(b.username, b.id::text) INTO v_name, v_slug
  FROM public.businesses b WHERE b.id = NEW.business_id;
  BEGIN
    PERFORM public.notify_keepers(
      NEW.business_id, 'events',
      CASE WHEN NEW.status = 'live'
        THEN v_name || ' is live now'
        ELSE v_name || ' is going live soon' END,
      NEW.title, '/' || v_slug || '?tab=live');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'keep notify (events) failed for %: %', NEW.business_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_stream ON public.business_streams;
CREATE TRIGGER trg_keep_stream
  AFTER INSERT ON public.business_streams
  FOR EACH ROW EXECUTE FUNCTION public.keep_notify_stream();

/*
  Opening. Fires only on the transition INTO open — a column written with the
  same value it already held is not news, and open_status gets rewritten by the
  clock sync more often than it actually changes.
*/
CREATE OR REPLACE FUNCTION public.keep_notify_opening()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.open_status IS DISTINCT FROM 'open' THEN RETURN NEW; END IF;
  IF OLD.open_status IS NOT DISTINCT FROM NEW.open_status THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.notify_keepers(
      NEW.id, 'openings',
      NEW.name || ' is open now',
      NULL, '/' || coalesce(NEW.username, NEW.id::text));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'keep notify (openings) failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_opening ON public.businesses;
CREATE TRIGGER trg_keep_opening
  AFTER UPDATE OF open_status ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.keep_notify_opening();
