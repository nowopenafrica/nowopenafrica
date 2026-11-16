#!/usr/bin/env bash
# Runs the Template Bank migration against a throwaway local Postgres and
# exercises the import, review and publish functions.
#
#   bash scripts/template-bank/test-migration.sh
#
# Needs a local Postgres install (initdb, pg_ctl, psql). It never touches a
# Supabase project: the auth schema and is_admin() are stubbed here.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20261116000000_template_bank.sql"
BIN="$(dirname "$(find /usr/lib/postgresql /usr/local /opt -name initdb -type f 2>/dev/null | head -1)")"
WORK="$(mktemp -d)"
PORT=54329
chmod 755 "$WORK"

run_as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$WORK"
cp "$MIGRATION" "$WORK/migration.sql" && chmod 644 "$WORK/migration.sql"

run_as_pg "$BIN/initdb" -D "$WORK/data" -A trust >/dev/null
run_as_pg "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -c listen_addresses='' -k $WORK" -l "$WORK/log" -w start >/dev/null
trap 'run_as_pg "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

sql() { run_as_pg psql -h "$WORK" -p "$PORT" -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

sql <<'SQL'
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.users (id uuid PRIMARY KEY, role text);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') $$;
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
INSERT INTO public.users VALUES ('00000000-0000-0000-0000-00000000000a', 'admin'), ('00000000-0000-0000-0000-00000000000b', 'business');
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
SQL

sql -f "$WORK/migration.sql"
sql -f "$WORK/migration.sql"   # re-runnable
sql -c "GRANT SELECT ON public.design_templates TO anon, authenticated"

PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); echo "  pass  $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
# expect_error <label> <needle> <sql>
expect_error() {
  local out
  if out=$(sql -c "$3" 2>&1); then bad "$1 (no error raised)"; elif grep -q "$2" <<<"$out"; then ok "$1"; else bad "$1 (got: $out)"; fi
}
# expect <label> <want> <sql>
expect() { local got; got=$(sql -c "$3" 2>&1 | tail -1); [ "$got" = "$2" ] && ok "$1" || bad "$1 (want $2, got $got)"; }

ADMIN="SET test.uid = '00000000-0000-0000-0000-00000000000a';"
USER="SET test.uid = '00000000-0000-0000-0000-00000000000b';"
tpl() { echo "{\"id\":\"T-$1\",\"key\":\"$1\",\"version\":$2,\"division\":\"02-social-media\",\"category\":\"Post\",\"definition\":{\"key\":\"${3:-$1}\"}}"; }

expect_error "a non-admin cannot import" "Admins only" \
  "$USER SELECT public.import_template_collection('Bank','1.0.0','sum-0','[$(tpl a 1)]'::jsonb)"

expect_error "a package with one bad template is refused" "does not match its own definition" \
  "$ADMIN SELECT public.import_template_collection('Bank','1.0.0','sum-1','[$(tpl a 1),$(tpl b 1),$(tpl c 1 wrong)]'::jsonb)"
expect "and it leaves no templates behind" "0" "SELECT count(*) FROM public.design_templates"
expect "and no collection behind" "0" "SELECT count(*) FROM public.design_template_collections"

sql -c "$ADMIN SELECT public.import_template_collection('Bank','1.0.0','sum-2','[$(tpl a 1),$(tpl b 1)]'::jsonb)" >/dev/null
expect "a valid package imports every template" "2" "SELECT count(*) FROM public.design_templates"
expect "imported templates start pending and unpublished" "2" \
  "SELECT count(*) FROM public.design_templates WHERE review_status = 'pending' AND NOT published AND review_score IS NULL"
expect "the definition is stored apart from the metadata" "f" \
  "SELECT meta ? 'definition' FROM public.design_templates WHERE key = 'a'"

expect_error "the same file cannot be imported twice" "already been imported" \
  "$ADMIN SELECT public.import_template_collection('Bank','1.0.0','sum-2','[$(tpl z 1)]'::jsonb)"
expect_error "an older or equal version is refused" "is not newer" \
  "$ADMIN SELECT public.import_template_collection('Bank','1.0.1','sum-3','[$(tpl a 1)]'::jsonb)"

expect_error "an unreviewed template cannot be published by a direct update" "design_templates_publish_gate" \
  "UPDATE public.design_templates SET published = true WHERE key = 'a'"
expect "publishing a collection with nothing approved publishes nothing" "0" \
  "$ADMIN SELECT public.publish_template_collection((SELECT id FROM public.design_template_collections))"

expect_error "approval needs a score of 80 or more" "score of 80 or more" \
  "$ADMIN SELECT public.review_template((SELECT id FROM public.design_templates WHERE key = 'a'),'approved',79,NULL,NULL)"
expect_error "a non-admin cannot review" "Admins only" \
  "$USER SELECT public.review_template((SELECT id FROM public.design_templates WHERE key = 'a'),'approved',95,NULL,NULL)"
sql -c "$ADMIN SELECT public.review_template((SELECT id FROM public.design_templates WHERE key = 'a'),'approved',86,'{\"typography\":13}'::jsonb,'Good')" >/dev/null
expect "publishing sends only the approved template live" "1" \
  "$ADMIN SELECT public.publish_template_collection((SELECT id FROM public.design_template_collections))"
expect "the unapproved template stays unpublished" "f" "SELECT published FROM public.design_templates WHERE key = 'b'"

expect "the public sees published templates only" "1" "SET ROLE anon; SELECT count(*) FROM public.design_templates"
expect "an admin sees every template" "2" "SET ROLE authenticated; $ADMIN SELECT count(*) FROM public.design_templates"

sql -c "$ADMIN SELECT public.import_template_collection('Bank','1.1.0','sum-4','[$(tpl a 2)]'::jsonb)" >/dev/null
sql -c "$ADMIN SELECT public.review_template((SELECT id FROM public.design_templates WHERE key = 'a' AND version = 2),'approved',90,NULL,NULL)" >/dev/null
sql -c "$ADMIN SELECT public.publish_template_collection((SELECT id FROM public.design_template_collections WHERE version = '1.1.0'))" >/dev/null
expect "a new version replaces the live one" "2" "SELECT version FROM public.design_templates WHERE key = 'a' AND published"
expect "and only one version of a key is ever live" "1" "SELECT count(*) FROM public.design_templates WHERE key = 'a' AND published"

sql -c "$ADMIN SELECT public.review_template((SELECT id FROM public.design_templates WHERE key = 'a' AND version = 2),'rejected',40,NULL,'Withdrawn')" >/dev/null
expect "rejecting a live template withdraws it" "0" "SELECT count(*) FROM public.design_templates WHERE key = 'a' AND published"

sql -c "$ADMIN SELECT public.review_template((SELECT id FROM public.design_templates WHERE key = 'b'),'approved',82,NULL,NULL); SELECT public.publish_template_collection((SELECT id FROM public.design_template_collections WHERE version = '1.0.0'))" >/dev/null
sql -c "$ADMIN SELECT public.unpublish_template((SELECT id FROM public.design_templates WHERE key = 'b'))" >/dev/null
expect "unpublishing keeps the review" "approved|82|f" "SELECT review_status, review_score, published FROM public.design_templates WHERE key = 'b'"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
