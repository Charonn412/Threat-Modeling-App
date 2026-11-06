#!/usr/bin/env bash
# Runs the schema and RLS tests against a throwaway local PostgreSQL 16 cluster.
# Usage: supabase/tests/run.sh   (needs PostgreSQL server binaries; run as root or a normal user)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUNAS=()
if [ "$(id -u)" = "0" ]; then RUNAS=(runuser -u postgres --); chown postgres "$WORK"; chmod 755 "$HERE" "$HERE"/*.sql; fi
cleanup() { "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"${RUNAS[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("${RUNAS[@]}" env PGOPTIONS="$PGOPTIONS" "$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$HERE/auth_emulation.sql"
"${PSQL[@]}" -f "$HERE/../schema.sql"
"${PSQL[@]}" -f "$HERE/../schema.sql"   # re-runnable
"${PSQL[@]}" -f "$HERE/rls_test.sql" 2>&1 | grep -E "ok:|FAIL|ERROR|PASSED" | sed 's/^psql:[^ ]* //'
