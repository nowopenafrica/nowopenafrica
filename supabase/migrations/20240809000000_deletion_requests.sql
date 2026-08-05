/*
  # Deletion requests (owner → admin approval)

  Business owners can no longer hard-delete their own listings. Instead the
  "delete" button files a deletion request that an admin reviews and either
  approves (which performs the actual delete) or rejects.

  - `deletion_requests` — one row per request.
    entity_type: 'business' | 'advert' | 'media'
    status:      'pending' | 'approved' | 'rejected'

  Security (RLS):
    - Owners may create a request for themselves and read their own requests.
    - Admins may read every request and update status (approve/reject).
    - The actual entity delete stays admin-gated by the existing table policies,
      so a spurious request can never delete anything on its own.
*/

CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  entity_label text,
  reason       text,
  status       text NOT NULL DEFAULT 'pending',
  reviewed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON public.deletion_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_owner  ON public.deletion_requests (requester_id);
-- Avoid stacking duplicate open requests for the same entity.
CREATE UNIQUE INDEX IF NOT EXISTS deletion_requests_pending_unique
  ON public.deletion_requests (entity_type, entity_id)
  WHERE status = 'pending';

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners create deletion requests" ON public.deletion_requests;
CREATE POLICY "Owners create deletion requests" ON public.deletion_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Owners read their deletion requests" ON public.deletion_requests;
CREATE POLICY "Owners read their deletion requests" ON public.deletion_requests
  FOR SELECT TO authenticated USING (auth.uid() = requester_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage deletion requests" ON public.deletion_requests;
CREATE POLICY "Admins manage deletion requests" ON public.deletion_requests
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
