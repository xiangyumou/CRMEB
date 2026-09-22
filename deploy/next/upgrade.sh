#!/usr/bin/env bash
# Deploy a release, and end on the previous images if it does not come up.
#
#   deploy/next/upgrade.sh \
#     --web    ghcr.io/…/crmeb-next-web@sha256:… \
#     --worker ghcr.io/…/crmeb-next-worker@sha256:… \
#     --edge   ghcr.io/…/crmeb-next-edge@sha256:… \
#     [--app-version <commit>] [--dry-run] [--skip-migration] [--first-deploy]
#
# In order, refusing to continue when a step cannot be proven:
#
#   1. all three candidates are fixed digests (a moving tag is refused), and
#      the running images are recorded as the rollback target;
#   2. the candidates are pulled *before* a writer is stopped, so a registry
#      problem is not discovered mid-window;
#   3. the application services are stopped — a migration never runs against
#      live writers;
#   4. `backup.sh` dumps and proves the dump restorable;
#   5. the migrations and the reference seed run as a one-shot;
#   6. the stack starts on the candidates and has to pass the readiness gate;
#   7. **any failure from step 5 on rolls the images back to what was
#      running**, and the script says whether the schema had already moved.
#
# Why the automatic rollback, where the old stack's script stayed in
# maintenance mode: the migrations here are additive (`0000_init` and whatever
# drizzle adds to it), so the previous image tolerates the new schema, and an
# unattended failure is better ending on a stack that serves than on a stack
# that is down. When the migration had already run, the script says so in as
# many words and names the dump, because *data* recovery is a separate,
# deliberate operation and this script never performs one.
#
# Exit codes: 0 deployed · 1 failed, rolled back to the previous images ·
#             2 misuse · 3 failed AND the rollback failed — needs a human.
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$here/lib/common.sh"
# shellcheck source=lib/readiness.sh
. "$here/lib/readiness.sh"

web_candidate=''
worker_candidate=''
edge_candidate=''
app_version=''
dry_run=0
skip_migration=0
first_deploy=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --web)
      web_candidate="${2:?--web needs an image}"
      shift
      ;;
    --web=*) web_candidate="${1#*=}" ;;
    --worker)
      worker_candidate="${2:?--worker needs an image}"
      shift
      ;;
    --worker=*) worker_candidate="${1#*=}" ;;
    --edge)
      edge_candidate="${2:?--edge needs an image}"
      shift
      ;;
    --edge=*) edge_candidate="${1#*=}" ;;
    --app-version)
      app_version="${2:?--app-version needs a value}"
      shift
      ;;
    --app-version=*) app_version="${1#*=}" ;;
    --dry-run) dry_run=1 ;;
    --skip-migration) skip_migration=1 ;;
    --first-deploy) first_deploy=1 ;;
    -h | --help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      warn "unknown argument: $1"
      exit 2
      ;;
  esac
  shift
done

require_settings
compose config >/dev/null || die 'the compose configuration cannot be parsed'

# All three, always. A release where `web` moved and `worker` did not is a web
# talking to a worker built against a different contract; there is no reason to
# make that easy to type.
require_candidate web "$web_candidate"
require_candidate worker "$worker_candidate"
require_candidate edge "$edge_candidate"

# --- 1. record what is running -----------------------------------------------
declare -A previous_ref previous_id
missing=0
for service in $APP_SERVICES; do
  if captured="$(running_image_ref "$service")"; then
    previous_ref["$service"]="${captured%% *}"
    previous_id["$service"]="${captured##* }"
    say "current $service: ${previous_ref[$service]}"
  else
    previous_ref["$service"]=''
    previous_id["$service"]=''
    missing=$((missing + 1))
    warn "no running container for $service"
  fi
done

if [ "$missing" -gt 0 ] && [ "$first_deploy" -eq 0 ]; then
  die "$missing application service(s) are not running, so there is no rollback target.
  Pass --first-deploy if this host has never deployed the new stack."
fi
if [ "$missing" -eq 0 ] && [ "$first_deploy" -eq 1 ]; then
  die '--first-deploy was given but the stack is already running; refusing to guess'
fi

say "candidate web:    $web_candidate"
say "candidate worker: $worker_candidate"
say "candidate edge:   $edge_candidate"

# --- 2. pull before anything is stopped --------------------------------------
for candidate in "$web_candidate" "$worker_candidate" "$edge_candidate"; do
  if is_digest_ref "$candidate"; then
    docker pull "$candidate" >/dev/null || die "could not pull $candidate"
  fi
  docker image inspect "$candidate" >/dev/null 2>&1 ||
    die "candidate is not available locally: $candidate"
done
say 'all candidates are present locally'

if [ "$dry_run" -eq 1 ]; then
  say 'dry run: nothing was stopped, no backup was taken, no migration ran'
  exit 0
fi

backup_dir="${NEXT_BACKUP_DIR:-$(setting NEXT_BACKUP_DIR)}"
backup_dir="${backup_dir:-$deploy_root/data/backups}"
case "$backup_dir" in /*) ;; *) backup_dir="$deploy_root/${backup_dir#./}" ;; esac
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
manifest="$backup_dir/upgrade-$stamp.manifest"
settings_backup="$backup_dir/deployment.env.$stamp"
cp -p "$settings" "$settings_backup"
chmod 600 "$settings_backup"

{
  printf 'stamp=%s\n' "$stamp"
  printf 'settings_backup=%s\n' "$settings_backup"
  for service in $APP_SERVICES; do
    printf 'previous_%s=%s\n' "$service" "${previous_ref[$service]}"
    printf 'previous_%s_id=%s\n' "$service" "${previous_id[$service]}"
  done
  printf 'candidate_web=%s\n' "$web_candidate"
  printf 'candidate_worker=%s\n' "$worker_candidate"
  printf 'candidate_edge=%s\n' "$edge_candidate"
} >"$manifest"
chmod 600 "$manifest"
say "manifest: $manifest"

migrated=0
backup_file=''

# --- the rollback path -------------------------------------------------------
roll_back() {
  local reason="$1" service failed=0
  warn ''
  warn "UPGRADE FAILED: $reason"
  if [ "$first_deploy" -eq 1 ]; then
    warn 'This was a first deploy: there is no previous image to return to, so'
    warn 'there is nothing to roll back to and nothing was taken away from anyone.'
    warn "The stack is left as it is; the settings backup is $settings_backup."
    warn 'Read the logs of the service that did not come up, fix it, and re-run.'
    printf 'outcome=first-deploy-failed\nreason=%s\n' "$reason" >>"$manifest"
    # 1, not 3: "needs a human" is about a stack that lost its way back. A
    # first deploy that did not come up has no way back to lose.
    exit 1
  fi
  warn 'Returning to the previously running images.'
  cp -p "$settings_backup" "$settings"
  if ! compose up -d --wait --wait-timeout 240 >/dev/null 2>&1; then
    warn 'the previous images did not come up either'
    failed=1
  fi
  for service in $APP_SERVICES; do
    if service_runs "$service" "${previous_ref[$service]}" "${previous_id[$service]}"; then
      warn "  $service is back on ${previous_ref[$service]}"
    else
      warn "  $service is NOT on ${previous_ref[$service]}"
      failed=1
    fi
  done
  if [ "$migrated" -eq 1 ]; then
    warn ''
    warn 'NOTE: the migrations had already run, so the database is on the NEW schema'
    warn 'while the containers are on the PREVIOUS images. The migrations are additive,'
    warn 'so this serves; it is not a state to leave a release in.'
    warn "  verified dump: ${backup_file:-<none>}"
    warn "  restore it deliberately — no script here does it for you."
  fi
  printf 'outcome=rolled-back\nreason=%s\nmigrated=%s\n' "$reason" "$migrated" >>"$manifest"
  return "$failed"
}

fail() {
  if roll_back "$1"; then
    exit 1
  fi
  warn ''
  warn 'THE ROLLBACK ALSO FAILED. The stack needs a human.'
  exit 3
}

# --- 3. stop the writers -----------------------------------------------------
say 'stopping the application services'
# shellcheck disable=SC2086  # deliberate word splitting: a list of services.
compose stop $APP_SERVICES >/dev/null

# --- 4. back up --------------------------------------------------------------
if [ "$first_deploy" -eq 1 ]; then
  say 'first deploy: no database to back up yet'
  compose up -d --wait --wait-timeout 180 postgres redis >/dev/null ||
    die 'postgres/redis did not come up'
else
  say 'backing up the database'
  backup_file="$("$here"/backup.sh --out "$backup_dir/pre-upgrade-$stamp.sql.gz" | tail -n1)" || {
    warn 'the backup could not be taken or verified; nothing was migrated'
    cp -p "$settings_backup" "$settings"
    compose up -d --wait --wait-timeout 240 >/dev/null 2>&1 || true
    exit 1
  }
  printf 'backup=%s\n' "$backup_file" >>"$manifest"
  say "backup: $backup_file"
fi

# --- 5. pin the candidates and migrate ---------------------------------------
set_setting NEXT_WEB_IMAGE "$web_candidate"
set_setting NEXT_WORKER_IMAGE "$worker_candidate"
set_setting NEXT_EDGE_IMAGE "$edge_candidate"
[ -z "$app_version" ] || set_setting APP_VERSION "$app_version"

if [ "$skip_migration" -eq 0 ]; then
  say 'running the migrations and the reference seed'
  migrated=1
  compose --profile migrate run --rm --no-deps -T migrate ||
    fail 'the migration failed'
else
  say 'skipping the migrations as requested'
fi

# --- 6. start and prove it -----------------------------------------------------
say 'starting the stack on the candidates'
compose up -d --wait --wait-timeout 300 >/dev/null ||
  fail 'the stack did not become healthy'

for service in $APP_SERVICES; do
  case "$service" in
    web) want="$web_candidate" ;;
    worker) want="$worker_candidate" ;;
    edge) want="$edge_candidate" ;;
    *) want='' ;;
  esac
  service_runs "$service" "$want" '' ||
    fail "$service is not running the candidate $want"
done

readiness_gate || fail 'the readiness gate did not pass'

printf 'outcome=deployed\nmigrated=%s\n' "$migrated" >>"$manifest"
say ''
say 'upgrade complete'
say "  web:    $web_candidate"
say "  worker: $worker_candidate"
say "  edge:   $edge_candidate"
say "  rollback target: ${previous_ref[web]:-<none>} / ${previous_ref[worker]:-<none>} / ${previous_ref[edge]:-<none>}"
say "  manifest: $manifest"
[ -z "$backup_file" ] || say "  backup:   $backup_file"
