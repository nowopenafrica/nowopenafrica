# Archived migrations

These files are the original (pre-cleanup) migrations. They are kept for
reference only and should **not** be applied:

- Several were duplicates or near-duplicates of each other
  (`add_billboard_placements.sql`, `update_advertising_placements.sql`, …).
- `create_advert_table.sql` created a third, differently-named adverts table
  (`advert`) and would fail anyway (`text` foreign key against a `uuid` column).
- The untimestamped files were never applied in a predictable order by the
  Supabase CLI.

The active, consolidated set lives in `supabase/migrations/`:

1. `20240601000000_create_users_table.sql` — users/profile table + signup trigger
2. `20240601000100_create_businesses_table.sql`
3. `20240601000200_create_advertisements_table.sql` — consolidated schema
4. `20240601000300_create_media_services_table.sql`
5. `20240617000000_seed_advertising_placements.sql` — seed data (was `update_ad_pricing.sql`)
6. `20240618000000_add_billboard_placements.sql` — extra billboard seed rows

All active migrations are idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`),
so they can be applied safely against the existing live database.

`clear_all_user_data.sql` was moved to `scripts/sql/` — it deletes all rows in
every table and must only ever be run manually.
