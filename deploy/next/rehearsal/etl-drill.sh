#!/usr/bin/env bash
# The ETL drill: a legacy MySQL dump becomes a shop you can browse, in one
# command, on throwaway containers.
#
#   deploy/next/rehearsal/etl-drill.sh <dump.sql.gz> --uploads-root /mnt/legacy/uploads
#   deploy/next/rehearsal/etl-drill.sh --self-test     # the synthetic fixture
#
# `packages/etl/scripts/rehearse.sh` already proves the *migration*: import,
# migrate, run it twice, diff the two results, verify. This script is the half
# after that one — it asks the question a `verify` pass cannot:
#
#     does the migrated data actually render?
#
# So it starts the real `web` and `edge` images against the migrated database
# and fetches, over HTTP, through the edge, exactly as a shopper's browser
# would:
#
#   * one product   GET /api/v1/catalog/products/<id>
#   * one DIY page  GET /api/v1/diy/pages/<id>
#   * one attachment  GET <the url the database stores>, and the bytes are
#     hashed and compared against the `sha256` the migration recorded
#
# The third one is the reason the edge is here rather than just `web`: uploads
# are files on disk that nginx serves, and "the attachment row migrated" and
# "the image loads" are two different claims. A cutover that discovers the
# difference is a cutover with a shop full of broken images.
#
# ## What it will not do
#
# It never contacts a host, never writes to the dump, and never copies the dump
# into the repository — it is bind-mounted read-only and decompressed inside
# the MySQL container. A real dump must not end up in a working tree, a stash
# or a branch, and the surest way is never to put it there.
#
# Running it against a copy of production data is a decision for the person who
# owns that data, not for this script. It is written so that once a dump is
# present the run is one command, and nothing more.
#
# ## Prerequisites
#
#   docker, pnpm (the ETL and the migrator run from this checkout), rsync,
#   curl, and either `sha256sum` or `shasum`.
#
# Exit codes: 0 everything passed · 1 a check failed · 2 misuse ·
#             3 the environment could not be built (nothing was proved).
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd "$here/.." && pwd)"
repo_root="$(cd "$deploy_dir/../.." && pwd)"
next_root="$repo_root/next"

MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8.0}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
REDIS_IMAGE="${REDIS_IMAGE:-redis:7-alpine}"

dump=''
uploads_root=''
web_image=''
edge_image=''
build=1
keep=0
self_test=0

usage() {
  sed -n '2,46p' "$0" >&2
  exit "${1:-2}"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --self-test) self_test=1 ;;
    --uploads-root)
      uploads_root="${2:?--uploads-root needs a directory}"
      shift
      ;;
    --uploads-root=*) uploads_root="${1#*=}" ;;
    --web)
      web_image="${2:?--web needs an image}"
      shift
      ;;
    --edge)
      edge_image="${2:?--edge needs an image}"
      shift
      ;;
    --no-build) build=0 ;;
    --keep) keep=1 ;;
    -h | --help) usage 0 ;;
    -*)
      printf 'unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
    *)
      [ -z "$dump" ] || {
        printf 'more than one dump given\n' >&2
        exit 2
      }
      dump="$1"
      ;;
  esac
  shift
done

# --- environment ------------------------------------------------------------

need() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '%s is required\n' "$1" >&2
    exit 3
  }
}
need docker
need pnpm
need rsync
need curl
docker info >/dev/null 2>&1 || {
  printf 'the docker daemon is not reachable\n' >&2
  exit 3
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

run_id="$(date +%Y%m%d%H%M%S)-$$"
workdir="$(mktemp -d "${TMPDIR:-/tmp}/crmeb-etl-drill.XXXXXX")"
chmod 700 "$workdir"
network="crmeb-etl-drill-$run_id"
mysql_name="crmeb-etl-drill-mysql-$run_id"
pg_name="crmeb-etl-drill-pg-$run_id"
redis_name="crmeb-etl-drill-redis-$run_id"
web_name="crmeb-etl-drill-web-$run_id"
edge_name="crmeb-etl-drill-edge-$run_id"

# Generated per run into a mode-600 file, and deleted on teardown. They protect
# containers that exist for twenty minutes on one loopback interface, but the
# habit — never a credential in argv, where `ps` shows it to every process on
# the box — is the one that matters when the database is real.
umask 077
secret() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
mysql_password="$(secret)"
pg_password="$(secret)"
redis_password="$(secret)"
printf 'MYSQL_PWD=%s\nPGPASSWORD=%s\n' "$mysql_password" "$pg_password" >"$workdir/secrets.env"
chmod 600 "$workdir/secrets.env"

teardown() {
  local code=$?
  set +e
  if [ "$keep" -eq 1 ]; then
    printf '\n--keep: left behind\n'
    printf '  network:   %s\n' "$network"
    printf '  mysql:     %s\n' "$mysql_name"
    printf '  postgres:  %s\n' "$pg_name"
    printf '  edge:      http://127.0.0.1:%s\n' "${edge_port:-?}"
    printf '  workdir:   %s (holds the generated passwords)\n' "$workdir"
    return "$code"
  fi
  printf '\ntearing the ETL drill down\n'
  docker rm -f "$edge_name" "$web_name" "$redis_name" "$pg_name" "$mysql_name" >/dev/null 2>&1
  docker network rm "$network" >/dev/null 2>&1
  rm -rf "$workdir"
  return "$code"
}
trap teardown EXIT

step() { printf '\n=== %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }

failures=0
check() {
  local what="$1"
  shift
  if "$@"; then
    note "ok: $what"
    return 0
  fi
  note "NOT ok: $what"
  failures=$((failures + 1))
  return 1
}

# --- the dump ----------------------------------------------------------------

# The synthetic fixture the ETL's own integration test uses. Every row in it is
# invented and its header says so; it is the only dump that may ever be run
# from inside this repository. It is what proves this script works without
# anyone having to hand it real data first.
if [ "$self_test" -eq 1 ]; then
  [ -z "$dump" ] || usage
  fixture="$next_root/packages/etl/test/fixtures/legacy-mini.sql"
  [ -f "$fixture" ] || {
    printf 'the synthetic fixture is missing: %s\n' "$fixture" >&2
    exit 3
  }
  dump="$workdir/legacy-mini.sql.gz"
  gzip -c "$fixture" >"$dump"
  # The fixture's four attachment rows point at these three files plus one that
  # is deliberately absent, so "a missing file is dropped and counted" stays
  # exercised. The bytes match `packages/etl/src/runner.int.test.ts`.
  uploads_root="$workdir/legacy-uploads"
  mkdir -p "$uploads_root/demo"
  printf 'synthetic-logo-bytes' >"$uploads_root/demo/logo.png"
  printf 'synthetic-banner-bytes' >"$uploads_root/demo/banner.jpg"
  printf 'synthetic-goods-bytes' >"$uploads_root/demo/goods-1.png"
  note "self-test: synthetic fixture, $(wc -l <"$fixture") lines, 3 upload files"
fi

[ -n "$dump" ] || usage
[ -f "$dump" ] || {
  printf 'no such dump: %s\n' "$dump" >&2
  exit 2
}
dump="$(cd "$(dirname "$dump")" && pwd)/$(basename "$dump")"

if [ -z "$uploads_root" ]; then
  printf 'this drill needs --uploads-root: without the old uploads tree the\n' >&2
  printf 'attachments have no bytes to hash, so they are dropped and the HTTP\n' >&2
  printf 'check for an image would be proving nothing.\n' >&2
  exit 2
fi
[ -d "$uploads_root" ] || {
  printf 'no such uploads root: %s\n' "$uploads_root" >&2
  exit 2
}

# --- images -------------------------------------------------------------------

if [ "$build" -eq 1 ]; then
  step 'building the web and edge images'
  web_image="${web_image:-crmeb-next-web:etl-drill}"
  edge_image="${edge_image:-crmeb-next-edge:etl-drill}"
  docker build -f "$next_root/docker/web.Dockerfile" -t "$web_image" "$next_root" || exit 3
  docker build -f "$next_root/docker/edge/Dockerfile" -t "$edge_image" "$repo_root" || exit 3
elif [ -z "$web_image" ] || [ -z "$edge_image" ]; then
  printf -- '--no-build needs --web and --edge\n' >&2
  exit 2
fi

# --- containers ----------------------------------------------------------------

free_port() {
  local port="$1"
  while [ "$port" -lt 65000 ]; do
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || {
      printf '%s\n' "$port"
      return 0
    }
    port=$((port + 1))
  done
  return 1
}

mysql_port="$(free_port 13306)" || exit 3
pg_port="$(free_port 15432)" || exit 3
edge_port="$(free_port 18090)" || exit 3

step "starting mysql, postgres and redis (network $network)"
docker network create "$network" >/dev/null || exit 3

# The passwords reach the containers through `--env-file`, never through `-e`
# on the command line: the latter is visible in `ps` for as long as the
# `docker run` lasts, and in the shell history for ever.
printf 'MYSQL_ROOT_PASSWORD=%s\nMYSQL_DATABASE=crmeb_legacy\n' "$mysql_password" >"$workdir/mysql.env"
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_USER=shop\nPOSTGRES_DB=shop\n' "$pg_password" >"$workdir/pg.env"
chmod 600 "$workdir/mysql.env" "$workdir/pg.env"

docker run -d --name "$mysql_name" --network "$network" --network-alias mysql \
  --env-file "$workdir/mysql.env" \
  -p "127.0.0.1:$mysql_port:3306" \
  -v "$dump:/dump:ro" \
  "$MYSQL_IMAGE" \
  --character-set-server=utf8mb4 --collation-server=utf8mb4_general_ci >/dev/null || exit 3

docker run -d --name "$pg_name" --network "$network" --network-alias postgres \
  --env-file "$workdir/pg.env" \
  -p "127.0.0.1:$pg_port:5432" \
  "$PG_IMAGE" >/dev/null || exit 3

docker run -d --name "$redis_name" --network "$network" --network-alias redis \
  "$REDIS_IMAGE" redis-server --requirepass "$redis_password" \
  --maxmemory-policy noeviction --save '' >/dev/null || exit 3

wait_for() {
  local name="$1" label="$2"
  shift 2
  for _ in $(seq 1 180); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  printf '%s did not become usable\n' "$label" >&2
  docker logs --tail 40 "$name" >&2 || true
  return 1
}

# Not `mysqladmin ping`: the MySQL entrypoint runs a temporary server while it
# initialises, and that server answers ping — so ping goes green well before
# root can log in, and the import then fails with "access denied" against a
# container that looked ready.
wait_for "$mysql_name" 'mysql' docker exec -e MYSQL_PWD="$mysql_password" "$mysql_name" \
  mysql -uroot -e 'select 1' || exit 3
wait_for "$pg_name" 'postgres' docker exec "$pg_name" pg_isready -q -U shop -d shop || exit 3
wait_for "$redis_name" 'redis' docker exec "$redis_name" \
  redis-cli --no-auth-warning -a "$redis_password" ping || exit 3

step 'importing the dump (read-only mount; the file is never written or copied)'
# Decompressed inside the container, so a multi-gigabyte dump never crosses the
# docker API and never lands in the repository. `MYSQL_PWD` rather than `-p…`:
# a password in argv is visible to every process on the box, and mysql itself
# warns about it.
case "$dump" in
  *.gz) decompress='gzip -dc /dump' ;;
  *) decompress='cat /dump' ;;
esac
docker exec -e MYSQL_PWD="$mysql_password" "$mysql_name" sh -ec \
  "$decompress | mysql -uroot --default-character-set=utf8mb4 crmeb_legacy" || exit 3

# --- the migration ---------------------------------------------------------------

# Through the published loopback ports, because the migrator and the ETL run
# from this checkout rather than from an image. Neither string is ever passed
# as an argument.
export LEGACY_MYSQL_URL="mysql://root:$mysql_password@127.0.0.1:$mysql_port/crmeb_legacy"
export DATABASE_URL="postgres://shop:$pg_password@127.0.0.1:$pg_port/shop"

step 'creating the new schema and its reference seed'
# The seed is a precondition, not something the ETL fills in: addresses point
# at real city ids, and a runner that half-filled the dictionary would leave two
# sources of truth for the city list. `etl run` refuses before the first group
# without it.
(cd "$next_root/packages/db" && pnpm db:migrate) || exit 3
(cd "$next_root/packages/db" && pnpm db:seed) || exit 3

step 'etl plan — what this dump contains'
(cd "$next_root/packages/etl" && pnpm etl plan) || exit 3

step 'etl run — the migration'
(cd "$next_root/packages/etl" && pnpm etl run --uploads-root "$uploads_root") || exit 3

step 'etl verify — the two databases, item by item'
(cd "$next_root/packages/etl" && pnpm etl verify --uploads-root "$uploads_root" --full-digest) ||
  exit 3

step 'etl assets — copying exactly the files the database references'
mkdir -p "$workdir/uploads"
(cd "$next_root/packages/etl" && pnpm etl assets \
  --uploads-root "$uploads_root" --dest "$workdir/uploads" \
  --out "$workdir/etl-out" --execute) || exit 3

# rsync -a preserves the *legacy* tree's modes, and the legacy tree belongs to
# whatever uid the old PHP-FPM pool ran as. The new edge serves these bytes as
# nginx's unprivileged worker (uid 101 in the image), which is a different user
# in a different container: a directory the old host left at 0700 makes every
# product image a 404 with `stat() … (13: Permission denied)` in the edge log —
# which reads as "the uploads did not migrate" and is not that at all.
#
# So the destination is made readable-and-traversable by everyone, which is
# what a public asset tree is. `a+rX` (capital X) sets +x on directories only,
# so an uploaded .png does not come out executable. `deploy/next/cutover.md`
# carries the same step against the real volume, and this is why.
chmod -R a+rX "$workdir/uploads"
note 'destination made world-readable (a+rX): nginx serves it as uid 101, not as you'

# --- the stack ---------------------------------------------------------------------

step 'starting web and edge against the migrated database'
# `postgres`, `redis` are the network aliases above, so these two strings are
# the same shape as the ones in `deployment.env` — which is the point: the
# containers are configured the way production configures them.
cat >"$workdir/web.env" <<ENV
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=384
PORT=3000
HOSTNAME=0.0.0.0
TZ=Asia/Shanghai
DATABASE_URL=postgres://shop:$pg_password@postgres:5432/shop
REDIS_URL=redis://:$redis_password@redis:6379
APP_ORIGIN=http://127.0.0.1:$edge_port
APP_VERSION=etl-drill
UPLOADS_DIR=/data/uploads
UPLOADS_PUBLIC_PREFIX=/uploads
LOG_LEVEL=info
VALIDATE_RESPONSES=1
ENV
chmod 600 "$workdir/web.env"

# `VALIDATE_RESPONSES=1` on purpose, and unlike production. A rehearsal is
# exactly where paying for response validation is worth it: a migrated row that
# does not satisfy its own contract becomes a 500 here instead of a rendering
# bug on cutover day.
docker run -d --name "$web_name" --network "$network" --network-alias web \
  --env-file "$workdir/web.env" \
  -v "$workdir/uploads:/data/uploads" \
  "$web_image" >/dev/null || exit 3

wait_for "$web_name" 'web' docker exec "$web_name" node /app/healthcheck.mjs || exit 3

docker run -d --name "$edge_name" --network "$network" \
  -p "127.0.0.1:$edge_port:80" \
  -v "$workdir/uploads:/data/uploads:ro" \
  "$edge_image" >/dev/null || exit 3

base="http://127.0.0.1:$edge_port"
wait_for "$edge_name" 'edge' curl -fsS --max-time 5 -o /dev/null "$base/healthz" || exit 3

# --- what the shop actually serves ---------------------------------------------------

psql_q() {
  docker exec -e PGPASSWORD="$pg_password" "$pg_name" \
    psql -v ON_ERROR_STOP=1 -qtAX -U shop -d shop -c "$1"
}

# `X-Client-Platform` because the storefront surface reads it; an h5 browser is
# what the edge serves.
fetch() {
  local path="$1" out="$2"
  curl -fsS --max-time 20 -H 'X-Client-Platform: h5' -o "$out" "$base$path"
}

step 'fetching the migrated shop over HTTP'

# `/readyz` is the deep probe (CR-1-j2): database, redis, migrations, worker.
# This drill starts no worker — it is rehearsing the *migration*, not the job
# queue — so a green /readyz is the wrong expectation and asserting one would
# teach whoever runs this to ignore the line. What is asserted instead is the
# part this drill is responsible for: the three dependencies the migrated shop
# reads from are `ok`. The `worker: failed` that comes with it is expected here
# and is exactly what a real cutover must *not* see.
readyz="$(curl -sS --max-time 10 "$base/readyz" || true)"
note "the stack reports: $readyz"
for dependency in database redis migrations; do
  check "/readyz: $dependency is ok" \
    grep -Eq "\"$dependency\"[[:space:]]*:[[:space:]]*\"ok\"" <<<"$readyz"
done
if grep -Eq '"worker"[[:space:]]*:[[:space:]]*"failed"' <<<"$readyz"; then
  note '  worker: failed — expected, this drill runs no worker container'
fi

product_id="$(psql_q "select id from products where deleted_at is null order by id limit 1" | tr -d '[:space:]')"
if [ -z "$product_id" ]; then
  note 'NOT ok: the migration produced no product to fetch'
  failures=$((failures + 1))
else
  if check "GET /api/v1/catalog/products/$product_id" fetch "/api/v1/catalog/products/$product_id" "$workdir/product.json"; then
    check 'the product body carries the id that was asked for' \
      grep -q "\"id\":\"$product_id\"" "$workdir/product.json"
  fi
fi

# A published page, because that is the only kind the storefront route returns
# — a draft would 404 and the failure would read as "DIY did not migrate".
diy_id="$(psql_q "select id from diy_pages where status = 'published' and deleted_at is null order by id limit 1" | tr -d '[:space:]')"
if [ -z "$diy_id" ]; then
  note 'NOT ok: the migration produced no published DIY page to fetch'
  failures=$((failures + 1))
else
  if check "GET /api/v1/diy/pages/$diy_id" fetch "/api/v1/diy/pages/$diy_id" "$workdir/diy.json"; then
    # The envelope has to survive the round trip; `content` is what the uni-app
    # renderer parses, and an empty one renders a blank page rather than an
    # error anybody would notice.
    check 'the DIY page carries a non-empty content envelope' \
      grep -q '"content":{.' "$workdir/diy.json"
  fi
fi

# The attachment is the one that needs real bytes at the far end, so it is
# checked by digest rather than by status code: nginx will happily serve a
# zero-length file with a 200.
attachment="$(psql_q "select url || ' ' || sha256 from attachments where deleted_at is null order by id limit 1")"
attachment_url="${attachment%% *}"
attachment_sha="${attachment##* }"
if [ -z "$attachment_url" ] || [ -z "$attachment_sha" ]; then
  note 'NOT ok: the migration produced no attachment to fetch'
  failures=$((failures + 1))
else
  if check "GET $attachment_url" fetch "$attachment_url" "$workdir/attachment.bin"; then
    got="$(sha256_of "$workdir/attachment.bin")"
    check "the bytes served match the sha256 the migration recorded" \
      [ "$got" = "$attachment_sha" ]
    [ "$got" = "$attachment_sha" ] || note "  served $got, recorded $attachment_sha"
  fi
fi

# --- result -----------------------------------------------------------------------------

step 'result'
if [ "$failures" -eq 0 ]; then
  printf 'the migrated shop serves a product, a DIY page and an attachment.\n'
  printf 'still to do before a real cutover:\n'
  printf '  * etl run --require-complete passes (every mapper has landed);\n'
  printf '  * the uploads tree is copied to the real volume and re-verified\n'
  printf '    with etl verify --full-digest against that destination;\n'
  printf '  * this drill was run against a copy of the dump you will cut over\n'
  printf '    from, not only against the synthetic fixture.\n'
else
  printf '%s check(s) failed.\n' "$failures" >&2
fi
[ "$failures" -eq 0 ]
