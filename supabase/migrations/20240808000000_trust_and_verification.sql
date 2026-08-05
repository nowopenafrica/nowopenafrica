/*
  # Business Trust & Verification (security increment 1)

  Adds tiered verification (Bronze→Platinum) and the signals a Business Trust
  Score is computed from, plus a place to upload identity/registration
  documents for admin review.

  1. Verification signals on `businesses` (all admin/reviewer-set, default false):
     email_verified, phone_verified, id_verified, registration_verified,
     address_verified, documents_reviewed, onsite_verified.
     Plus `verification_tier` (none|bronze|silver|gold|platinum) and
     `trust_score` (0–100), stamped by the admin review action.

  2. `verification_documents` — uploaded ID / registration / address / tax /
     selfie files awaiting review. Owner uploads (scoped via their business),
     admin reviews (approve/reject).

  3. Private `verification-docs` storage bucket — sensitive documents are NOT
     public (unlike business-images). Owners read/write only their own folder;
     admins read all.

  4. Security: a guard trigger freezes the verification columns (incl. the
     existing `verified` flag) against anyone who isn't an admin or the service
     role — otherwise the "owner can update own business" RLS policy would let a
     business mark ITSELF verified from the browser console.
*/

-- 1. Verification signal columns -------------------------------------------------
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS email_verified        boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS phone_verified        boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS id_verified           boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS registration_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS address_verified      boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS documents_reviewed    boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS onsite_verified       boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS verification_tier      text    NOT NULL DEFAULT 'none';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS trust_score            integer NOT NULL DEFAULT 0;

-- 2. verification_documents table ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  doc_type    text NOT NULL,          -- passport | national_id | drivers_license | selfie | company_registration | tax_id | address_proof
  file_url    text,
  file_path   text,                   -- storage object path (private bucket)
  status      text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_docs_business ON public.verification_documents (business_id, status);

ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;

-- Owner: manage documents for businesses they own.
DROP POLICY IF EXISTS "Owners manage their verification docs" ON public.verification_documents;
CREATE POLICY "Owners manage their verification docs" ON public.verification_documents
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id::text = auth.uid()::text))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id::text = auth.uid()::text));

-- Admin: full access to review.
DROP POLICY IF EXISTS "Admins manage verification docs" ON public.verification_documents;
CREATE POLICY "Admins manage verification docs" ON public.verification_documents
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. Private storage bucket for sensitive documents ------------------------------
-- If this INSERT is blocked by your project's storage permissions, create a
-- PRIVATE bucket named "verification-docs" in Dashboard → Storage instead, then
-- add the object policies below via Storage → Policies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-docs', 'verification-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Owner uploads into their own top-level folder (path = <uid>/<businessId>/<file>).
DROP POLICY IF EXISTS "Owners upload verification docs" ON storage.objects;
CREATE POLICY "Owners upload verification docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Owner reads their own; admins read all. (No public read — these are private.)
DROP POLICY IF EXISTS "Owners read own verification docs" ON storage.objects;
CREATE POLICY "Owners read own verification docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

DROP POLICY IF EXISTS "Owners delete own verification docs" ON storage.objects;
CREATE POLICY "Owners delete own verification docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'verification-docs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

-- 4. Guard: only admins / service role may change verification columns -----------
CREATE OR REPLACE FUNCTION public.guard_business_verification_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    NEW.verified              := OLD.verified;
    NEW.email_verified        := OLD.email_verified;
    NEW.phone_verified        := OLD.phone_verified;
    NEW.id_verified           := OLD.id_verified;
    NEW.registration_verified := OLD.registration_verified;
    NEW.address_verified      := OLD.address_verified;
    NEW.documents_reviewed    := OLD.documents_reviewed;
    NEW.onsite_verified       := OLD.onsite_verified;
    NEW.verification_tier     := OLD.verification_tier;
    NEW.trust_score           := OLD.trust_score;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_business_verification_columns ON public.businesses;
CREATE TRIGGER guard_business_verification_columns
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_verification_columns();
