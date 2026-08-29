/*
  # OS Forms Hub applications

  Extracted from scripts/sql/apply_all_migrations.sql, where this table was
  previously defined ONLY — so a database built with `supabase db push` never
  got it, and every intern/volunteer application failed to insert. The two
  paths now agree. Idempotent, so applying it over an existing install is safe.
*/

-- OS-23: the Universal Forms Hub. ONE public URL (/forms) serves every
-- relationship journey via a schema-driven form engine. Submissions land here
-- as rows - never one table per relationship type. Reads are admin-only; the
-- public route is insert-only (a public applicant can submit, but applicant
-- records are never exposed through public SELECTs). References are random and
-- unguessable so they cannot be enumerated. Mirrors src/lib/formsEngine.ts.
-- Idempotent; seeded rows use fixed ids and conflict on id.
CREATE TABLE IF NOT EXISTS os_form_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  relationship text NOT NULL CHECK (relationship IN (
    'employee', 'intern', 'volunteer', 'partner', 'collaborator',
    'business', 'advisor', 'media', 'other'
  )),
  applicant_name text NOT NULL,
  email text NOT NULL,
  country text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'screening', 'under-review', 'interview', 'documents', 'agreement',
    'approved', 'onboarding', 'active', 'archived',
    'qualification', 'discussion', 'proposal', 'nda'
  )),
  source text,
  answers jsonb DEFAULT '{}'::jsonb,
  consent boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  submitted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE os_form_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read applications" ON os_form_applications;
CREATE POLICY "Admins read applications" ON os_form_applications
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Public submit applications" ON os_form_applications;
CREATE POLICY "Public submit applications" ON os_form_applications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins update applications" ON os_form_applications;
CREATE POLICY "Admins update applications" ON os_form_applications
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete applications" ON os_form_applications;
CREATE POLICY "Admins delete applications" ON os_form_applications
  FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO os_form_applications
  (id, org_id, reference, relationship, applicant_name, email, country,
   status, source, answers, consent, consent_at, submitted_at)
VALUES
  ('80000000-0000-4000-8000-000000000001',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-EMP-2026-8K2MZ4', 'employee', 'Chukwu Emeka', 'chukwu@nowopen.africa',
   'Nigeria', 'approved', 'linkedin',
   '{"desired_role":"Senior Motion Designer","desired_department":"Creative & Brand"}'::jsonb,
   true, '2026-08-01T09:15:00Z', '2026-08-01T09:15:00Z'),
  ('80000000-0000-4000-8000-000000000002',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-INT-2026-4QX7A9', 'intern', 'Ada Obi', 'ada@nowopen.africa',
   'Nigeria', 'new', 'university',
   '{"institution":"University of Lagos","course":"Computer Science"}'::jsonb,
   true, '2026-08-12T14:00:00Z', '2026-08-12T14:00:00Z'),
  ('80000000-0000-4000-8000-000000000003',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-VOL-2026-9MNP3B', 'volunteer', 'Kofi Mensah', 'kofi@example.com',
   'Ghana', 'onboarding', NULL,
   '{"contribution_areas":["Community","Events"]}'::jsonb,
   true, '2026-07-15T10:30:00Z', '2026-07-15T10:30:00Z'),
  ('80000000-0000-4000-8000-000000000004',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-PTR-2026-2JKL8C', 'partner', 'Meatclub Nigeria', 'ops@meatclub.ng',
   'Nigeria', 'agreement', 'referral',
   '{"partnership_type":["Business"],"proposal":"Restaurant discovery distribution"}'::jsonb,
   true, '2026-08-03T11:00:00Z', '2026-08-03T11:00:00Z'),
  ('80000000-0000-4000-8000-000000000005',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-MED-2026-6TRV2D', 'media', 'Nairobi Media House', 'news@nairobi.media',
   'Kenya', 'discussion', 'event',
   '{"platform":["Newsletter","LinkedIn"],"audience_size":"40k"}'::jsonb,
   true, '2026-08-10T08:45:00Z', '2026-08-10T08:45:00Z')
ON CONFLICT (id) DO NOTHING;
