#!/usr/bin/env bash
# End-to-end test of the Template Bank: a real browser drives the real admin
# screen against the real migration on a throwaway local Postgres.
#
#   npm run bank:build && bash scripts/template-bank/e2e.sh
#
# There is no Supabase here. A small HTTP shim (e2e-shim.mjs) answers the few
# REST and RPC calls the screen makes by running them in Postgres, always as an
# admin. Sign-in and row security are covered by test-migration.sh instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ZIP="$ROOT/template-bank/dist/NOWOPEN-CREATIVE-TEMPLATE-BANK-V1.zip"
[ -f "$ZIP" ] || { echo "Build the package first: npm run bank:build"; exit 1; }
BIN="$(dirname "$(find /usr/lib/postgresql /usr/local /opt -name initdb -type f 2>/dev/null | head -1)")"
WORK="$(mktemp -d)"; chmod 755 "$WORK"
PGPORT=54330; SHIM=54331; WEB=5197

run_as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$WORK"
cp "$ROOT/supabase/migrations/20261116000000_template_bank.sql" "$WORK/migration.sql" && chmod 644 "$WORK/migration.sql"

cleanup() {
  [ -n "${SHIM_PID:-}" ] && kill "$SHIM_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  run_as_pg "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

run_as_pg "$BIN/initdb" -D "$WORK/data" -A trust >/dev/null
run_as_pg "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PGPORT -c listen_addresses='127.0.0.1'" -l "$WORK/log" -w start >/dev/null
PSQL="psql -h 127.0.0.1 -p $PGPORT -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt"
$PSQL <<'SQL'
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.users (id uuid PRIMARY KEY, role text);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') $$;
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000a');
INSERT INTO public.users VALUES ('00000000-0000-0000-0000-00000000000a', 'admin');
SQL
$PSQL -f "$WORK/migration.sql" 2>/dev/null

PGPORT=$PGPORT SHIM_PORT=$SHIM node "$ROOT/scripts/template-bank/e2e-shim.mjs" & SHIM_PID=$!
(cd "$ROOT" && VITE_SUPABASE_URL="http://127.0.0.1:$SHIM" VITE_SUPABASE_ANON_KEY=local npx vite --port $WEB --strictPort >"$WORK/vite.log" 2>&1) & WEB_PID=$!
for _ in $(seq 1 40); do curl -sf "http://localhost:$WEB/robots.txt" >/dev/null && break; sleep 0.5; done

WEB_PORT=$WEB PGPORT=$PGPORT ZIP="$ZIP" SHOTS="${SHOTS:-}" node "$ROOT/scripts/template-bank/e2e-run.cjs"
