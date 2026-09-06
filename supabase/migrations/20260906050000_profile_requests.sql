/*
  # "Send us your business name. We'll set up your NowOpen profile."

  The acquisition problem is not that owners refuse to join. It is that joining
  currently means finding /waitlist, filling in a form about themselves, and
  then still having no profile at the end. The work sits with the person we are
  asking for a favour.

  This inverts it. They send a name and a way to reach them; NowOpen does the
  building. Two fields, and one of them is a WhatsApp number.

  ## Why not the existing waitlist table

  `waitlist.email` is NOT NULL. Requiring an email address to say "here is my
  business" is precisely the friction this removes — in this market a WhatsApp
  number is the contact people actually have and actually answer. Relaxing that
  column would also merge two different queues: a waitlist entry is someone
  asking to be told when we launch, and this is a job of work for us to do.

  ## What it is not

  It does NOT create a business. Nothing here reaches the public directory.
  A request is a note in a queue that a person reads and acts on, which is the
  same rule the suggestion form follows: anyone can say a business exists, and
  saying so must not make it appear.
*/

CREATE TABLE IF NOT EXISTS public.profile_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  -- One field on the form. Whatever they gave us — a phone number, a WhatsApp
  -- number, an Instagram handle, an email. Asking somebody to classify their
  -- own contact detail is a dropdown nobody needs.
  contact       text NOT NULL,
  note          text,
  -- Where the request came from, so we can tell which surface actually works.
  source        text,
  status        text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'contacted', 'building', 'live', 'declined')),
  -- Filled in when the profile is actually created, so the queue can prove
  -- itself: requests in, businesses out.
  business_id   uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  handled_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_requests_open
  ON public.profile_requests (created_at DESC) WHERE status = 'new';

ALTER TABLE public.profile_requests ENABLE ROW LEVEL SECURITY;

-- Anyone may send one. This is the front door and it must not need an account:
-- an owner who has to sign up before telling us their business name is an owner
-- we have already lost.
DROP POLICY IF EXISTS "profile_requests_public_insert" ON public.profile_requests;
CREATE POLICY "profile_requests_public_insert"
  ON public.profile_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    btrim(business_name) <> ''
    AND btrim(contact) <> ''
    AND length(business_name) <= 160
    AND length(contact) <= 160
    AND length(coalesce(note, '')) <= 500
    -- A submitter cannot pre-set a status or attach itself to a business.
    AND status = 'new'
    AND business_id IS NULL
    AND handled_by IS NULL
  );

-- NOBODY MAY READ IT BACK. There is no SELECT policy for anon: these rows are
-- other people's contact details, and a public-insert table that is also
-- publicly readable is a contact list anyone can download.
--
-- This is also why the client must never chain .select() onto the insert —
-- PostgREST would ask for the row back, RLS would refuse, and the whole
-- statement fails with an error that blames the insert.
DROP POLICY IF EXISTS "profile_requests_staff_read" ON public.profile_requests;
CREATE POLICY "profile_requests_staff_read"
  ON public.profile_requests FOR SELECT
  TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "profile_requests_staff_update" ON public.profile_requests;
CREATE POLICY "profile_requests_staff_update"
  ON public.profile_requests FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Confirm afterwards:
--   as anon:  insert ... -> 201
--             select * from profile_requests -> 0 rows
