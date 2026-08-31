/*
  # Claim your business

  30 of the 32 businesses on this platform have no owner. They are real pages
  with real content that already rank — and nobody can manage them, because the
  only route to a business account is creating a new listing, which would
  duplicate the page that is already there.

  This is the cheapest acquisition the platform has: the owner finds their own
  page through search, presses one button, and becomes a business account. No
  advertising reaches them; their own customers do.

  WHY THIS CANNOT SELF-APPROVE

  Claiming a business grants control of it — its content, its enquiries, its
  customers, eventually its payments. An auto-approving claim is an account
  takeover with a friendly button, and the obvious attack is to claim a
  well-ranked business you do not own. So a claim is a REQUEST. An admin
  approves it, and only that approval sets businesses.user_id.

  This mirrors deletion_requests exactly, which is the pattern already used
  here for "owner asks, admin decides".

  Re-runnable: IF NOT EXISTS throughout; policies dropped before create.
*/

CREATE TABLE IF NOT EXISTS public.business_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /* How the claimant says they can prove it: a work email, the business phone,
     a CAC number, a social account. Free text on purpose — the point is to give
     a reviewer something to check, not to build a verification engine. */
  evidence    text,
  contact     text,
  status      text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_claims DROP CONSTRAINT IF EXISTS business_claims_status_check;
ALTER TABLE public.business_claims ADD CONSTRAINT business_claims_status_check
  CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_business_claims_status
  ON public.business_claims (status, created_at DESC);

/*
  One pending claim per person per business.

  Partial, so a rejected claim does not block an honest second attempt with
  better evidence — but somebody cannot flood the review queue for one business.
*/
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_claim_per_user
  ON public.business_claims (business_id, user_id)
  WHERE status = 'pending';

ALTER TABLE public.business_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users create their own claims" ON public.business_claims;
CREATE POLICY "Users create their own claims" ON public.business_claims
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read their own claims" ON public.business_claims;
CREATE POLICY "Users read their own claims" ON public.business_claims
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

/*
  Only an admin may change a claim, and that is the whole security model: the
  claimant can create and read, never update. Without this a claimant could
  PATCH their own row to status='approved'.
*/
DROP POLICY IF EXISTS "Admins manage claims" ON public.business_claims;
CREATE POLICY "Admins manage claims" ON public.business_claims
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

/*
  Approving a claim is what actually hands the business over.

  A trigger rather than app code, for the same reason the Keep fan-out is:
  businesses.user_id is guarded by RLS the claimant cannot satisfy — they do not
  own the row yet — so the transfer has to happen with definer rights, at the
  moment of approval, and nowhere else.

  Refuses to take a business that already has an owner. Somebody else claiming
  it first is a dispute for a human, not something to silently overwrite.
*/
CREATE OR REPLACE FUNCTION public.apply_business_claim()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;

  SELECT user_id INTO v_owner FROM public.businesses WHERE id = NEW.business_id;
  IF v_owner IS NOT NULL AND v_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'That business already has an owner';
  END IF;

  UPDATE public.businesses SET user_id = NEW.user_id WHERE id = NEW.business_id;

  -- Every other pending claim on this business is now moot.
  UPDATE public.business_claims
     SET status = 'rejected',
         note = coalesce(note, 'Another claim was approved first')
   WHERE business_id = NEW.business_id
     AND id <> NEW.id
     AND status = 'pending';

  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_business_claim ON public.business_claims;
CREATE TRIGGER trg_apply_business_claim
  BEFORE UPDATE ON public.business_claims
  FOR EACH ROW EXECUTE FUNCTION public.apply_business_claim();
