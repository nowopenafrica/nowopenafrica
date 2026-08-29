/*
  # OS Forms Hub applications

  Extracted from scripts/sql/apply_all_migrations.sql, where this table was
  previously defined ONLY — so a database built with `supabase db push` never
  got it, and every intern/volunteer application failed to insert. The two
  paths now agree. Idempotent, so applying it over an existing install is safe.
*/

-- OS-24: Applications Review — the admin side of the Forms Hub. Adds the
-- reviewer decision columns to os_form_applications so an admin can advance an
-- application honestly (status + updated_at) and record a rejection (archived
-- + rejected + decision_note). Idempotent and safe on existing rows; the
-- admin-only RLS from the OS-23 migration already covers UPDATE.
ALTER TABLE os_form_applications
  ADD COLUMN IF NOT EXISTS rejected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS decision_note text;
