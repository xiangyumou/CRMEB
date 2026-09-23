#!/usr/bin/env bash
# The deploy drill: every claim `deploy` makes, proved against real
# containers, on this machine, in one command.
#
#   deploy/rehearsal/drill.sh [--list] [--only <substring>] [--keep]
#                                  [--no-build --web REF --worker REF --edge REF]
#
# Each case has a stable id, so a rule in `docs/invariants.md` can point at
# something re-runnable rather than at a paragraph:
#
#   deploy/rehearsal/drill.sh::upgrade/failed-migration-ends-on-previous
#
# Everything is disposable and namespaced. The drill runs in its own Compose
# project (`crmeb-next-drill`), against its own generated settings file in a
# temporary directory, publishing on a free loopback port, pushing to a
# throwaway registry container it starts itself. It never reads, writes or
# touches `deploy/deployment.env`, the `crmeb-next` project, or any host
# but this one. The overlay case puts the edge on a stand-in network with a
# stand-in label, never on `server-internal-net` with Traefik's labels: on the
# production host that would hand the live domain's routers a second backend.
#
# Why a local registry rather than `NEXT_ALLOW_LOCAL_IMAGES=1`: the digest path
# is the part worth drilling. Pinning, pulling, and reading back the digest a
# container is actually running are three separate mechanisms, and a drill that
# bypasses them proves the scripts work in the one mode production never uses.
#
# Passwords are generated per run into a mode-600 file under $TMPDIR and
# deleted on teardown. No credential is ever passed in argv — the rule the real
# scripts keep, kept here too, so the drill is not the exception that teaches
# the habit.
#
# Exit codes: 0 every selected case passed · 1 a case failed · 2 misuse ·
#             3 the environment could not be built (nothing was proved).
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd "$here/.." && pwd)"
repo_root="$(cd "$deploy_dir/.." && pwd)"

only=''
keep=0
build=1
web_src=''
worker_src=''
edge_src=''
list_only=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --list) list_only=1 ;;
    --only)
      only="${2:?--only needs a substring}"
      shift
      ;;
    --only=*) only="${1#*=}" ;;
    --keep) keep=1 ;;
    --no-build) build=0 ;;
    --web)
      web_src="${2:?--web needs an image}"
      shift
      ;;
    --worker)
      worker_src="${2:?--worker needs an image}"
      shift
      ;;
    --edge)
      edge_src="${2:?--edge needs an image}"
      shift
      ;;
    -h | --help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      printf 'unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

# The order matters: a case that needs a deployed stack is written after the
# case that deploys one, and `--only` never reorders them.
CASE_IDS=(
  static/healthcheck-per-service
  static/memory-budget
  static/no-secrets-in-repo
  static/traefik-overlay-resolves
  overlay/refuses-missing-file
  upgrade/refuses-moving-tag
  upgrade/requires-all-three-candidates
  upgrade/first-deploy
  upgrade/dry-run-changes-nothing
  edge/proxies-every-page-route
  backup/verifies-restore
  backup/refuses-tampered-dump
  backup/refuses-truncated-dump
  upgrade/failed-migration-ends-on-previous
  upgrade/unhealthy-worker-ends-on-previous
  upgrade/readiness-gate-ends-on-previous
  upgrade/deploys-and-records-rollback-target
  rollback/refuses-unavailable-target
  rollback/last-upgrade-returns-previous
  overlay/upgrade-and-rollback-keep-overlay
)
CASE_FNS=(
  case_healthcheck_per_service
  case_memory_budget
  case_no_secrets_in_repo
  case_traefik_overlay_resolves
  case_overlay_refuses_missing
  case_refuses_moving_tag
  case_requires_all_three
  case_first_deploy
  case_dry_run
  case_edge_proxies_every_page
  case_backup_verifies_restore
  case_backup_refuses_tampered_dump
  case_backup_refuses_truncated_dump
  case_failed_migration
  case_unhealthy_worker
  case_readiness_gate
  case_deploys_v2
  case_rollback_refuses_unavailable
  case_rollback_last_upgrade
  case_overlay_kept
)

if [ "$list_only" -eq 1 ]; then
  printf '%s\n' "${CASE_IDS[@]}"
  exit 0
fi

# --- environment ---------------------------------------------------------------

command -v docker >/dev/null 2>&1 || {
  printf 'docker is required\n' >&2
  exit 3
}
docker info >/dev/null 2>&1 || {
  printf 'the docker daemon is not reachable\n' >&2
  exit 3
}

workdir="$(mktemp -d "${TMPDIR:-/tmp}/crmeb-next-drill.XXXXXX")"
chmod 700 "$workdir"
mkdir -p "$workdir/ctx"

export NEXT_PROJECT='crmeb-next-drill'
export NEXT_DEPLOYMENT_ENV="$workdir/deployment.env"
# compose.yml pins container names so `docker logs crmeb-next-worker` works;
# the prefix is what lets this run beside a real stack instead of colliding
# with it by name.
export NEXT_CONTAINER_PREFIX='crmeb-next-drill'
registry_container='crmeb-next-drill-registry'
# The stand-in for Traefik's external network, created by the overlay case.
overlay_network='crmeb-next-drill-front'

# A free loopback port, found by asking rather than by hoping. Bash's /dev/tcp
# needs no python, no ss and no netcat.
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

edge_port="$(free_port 18080)" || exit 3
registry_port="$(free_port 15000)" || exit 3
registry="127.0.0.1:$registry_port"

teardown() {
  local code=$?
  set +e
  if [ "$keep" -eq 1 ]; then
    printf '\n--keep: left behind\n'
    printf '  project:  %s\n' "$NEXT_PROJECT"
    printf '  settings: %s (holds generated passwords)\n' "$NEXT_DEPLOYMENT_ENV"
    printf '  edge:     http://127.0.0.1:%s\n' "$edge_port"
    printf '  registry: %s (container %s)\n' "$registry" "$registry_container"
    return "$code"
  fi
  printf '\ntearing the drill down\n'
  # `down -v` deletes volumes, which is right *here* and wrong anywhere else,
  # so the project name is a literal: no environment variable can point this
  # line at `crmeb-next`.
  docker compose -p 'crmeb-next-drill' --project-directory "$deploy_dir" \
    -f "$deploy_dir/compose.yml" --env-file "$NEXT_DEPLOYMENT_ENV" \
    --profile migrate down -v --remove-orphans >/dev/null 2>&1
  docker network rm "$overlay_network" >/dev/null 2>&1
  docker rm -f "$registry_container" >/dev/null 2>&1
  rm -rf "$workdir" # the generated passwords live in here
  return "$code"
}
trap teardown EXIT

# --- settings -------------------------------------------------------------------

secret() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

pg_password="$(secret)"
redis_password="$(secret)"

umask 077
sed \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$pg_password|" \
  -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$redis_password|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://shop:$pg_password@postgres:5432/shop|" \
  -e "s|^REDIS_URL=.*|REDIS_URL=redis://:$redis_password@redis:6379|" \
  -e "s|^APP_ORIGIN=.*|APP_ORIGIN=http://127.0.0.1:$edge_port|" \
  -e "s|^APP_VERSION=.*|APP_VERSION=drill|" \
  -e "s|^NEXT_EDGE_BIND=.*|NEXT_EDGE_BIND=127.0.0.1:$edge_port|" \
  -e "s|^NEXT_BACKUP_DIR=.*|NEXT_BACKUP_DIR=$workdir/backups|" \
  "$deploy_dir/deployment.env.example" >"$NEXT_DEPLOYMENT_ENV"
chmod 600 "$NEXT_DEPLOYMENT_ENV"

# shellcheck source=../lib/common.sh
. "$deploy_dir/lib/common.sh"

# --- images ----------------------------------------------------------------------

step() { printf '\n=== %s\n' "$*"; }

step "starting a throwaway registry on $registry"
docker rm -f "$registry_container" >/dev/null 2>&1 || true
docker run -d --name "$registry_container" -p "$registry:5000" registry:2 >/dev/null ||
  {
    printf 'could not start the registry\n' >&2
    exit 3
  }
for _ in $(seq 1 30); do
  (exec 3<>"/dev/tcp/127.0.0.1/$registry_port") 2>/dev/null && break
  sleep 1
done

if [ "$build" -eq 1 ]; then
  step 'building the three images'
  docker build -f "$repo_root/docker/web.Dockerfile" -t crmeb-next-web:drill "$repo_root" || exit 3
  docker build -f "$repo_root/docker/worker.Dockerfile" -t crmeb-next-worker:drill "$repo_root" || exit 3
  docker build -f "$repo_root/docker/edge/Dockerfile" -t crmeb-next-edge:drill "$repo_root" || exit 3
  web_src="${web_src:-crmeb-next-web:drill}"
  worker_src="${worker_src:-crmeb-next-worker:drill}"
  edge_src="${edge_src:-crmeb-next-edge:drill}"
elif [ -z "$web_src" ] || [ -z "$worker_src" ] || [ -z "$edge_src" ]; then
  printf -- '--no-build needs --web, --worker and --edge\n' >&2
  exit 2
fi

# Pushes an image and returns the immutable reference the registry gave it.
# That reference — never the tag that was pushed — is what the cases deploy,
# which is what `upgrade.sh` demands of a real release.
publish() {
  local source="$1" repo="$2" tag="$3" digest
  docker tag "$source" "$registry/$repo:$tag"
  docker push "$registry/$repo:$tag" >/dev/null
  digest="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$registry/$repo:$tag" |
    grep -F "$registry/$repo@sha256:" | head -n1)"
  [ -n "$digest" ] || {
    printf 'no digest for %s\n' "$repo" >&2
    return 1
  }
  printf '%s\n' "$digest"
}

# The derived images add a layer to a real one. The context is an empty
# directory: none of them copies anything in, and sending the repository would
# cost a gigabyte per build for nothing.
derive() {
  local dockerfile="$1" base="$2" tag="$3"
  shift 3
  docker build -f "$dockerfile" --build-arg "BASE=$base" "$@" -t "$tag" "$workdir/ctx" >/dev/null
}

step 'publishing the release candidates'
web_v1="$(publish "$web_src" crmeb-next-web v1)" || exit 3
worker_v1="$(publish "$worker_src" crmeb-next-worker v1)" || exit 3
edge_v1="$(publish "$edge_src" crmeb-next-edge v1)" || exit 3

derive "$here/relabel.Dockerfile" "$web_src" crmeb-next-web:drill-v2 --build-arg DRILL_VERSION=v2 || exit 3
derive "$here/relabel.Dockerfile" "$worker_src" crmeb-next-worker:drill-v2 --build-arg DRILL_VERSION=v2 || exit 3
derive "$here/relabel.Dockerfile" "$edge_src" crmeb-next-edge:drill-v2 --build-arg DRILL_VERSION=v2 || exit 3
web_v2="$(publish crmeb-next-web:drill-v2 crmeb-next-web v2)" || exit 3
worker_v2="$(publish crmeb-next-worker:drill-v2 crmeb-next-worker v2)" || exit 3
edge_v2="$(publish crmeb-next-edge:drill-v2 crmeb-next-edge v2)" || exit 3

derive "$here/broken-worker.Dockerfile" "$worker_src" crmeb-next-worker:drill-broken || exit 3
derive "$here/broken-migrate.Dockerfile" "$worker_src" crmeb-next-worker:drill-badmigrate || exit 3
worker_broken="$(publish crmeb-next-worker:drill-broken crmeb-next-worker broken)" || exit 3
worker_badmigrate="$(publish crmeb-next-worker:drill-badmigrate crmeb-next-worker badmigrate)" || exit 3

say "  web    v1 $web_v1"
say "  web    v2 $web_v2"
say "  worker v1 $worker_v1"
say "  worker v2 $worker_v2"

# --- the harness ------------------------------------------------------------------

passed=0
failed=0
skipped=0
case_failures=0
results=()

note() { printf '    %s\n' "$*"; }

# A case function runs inside `fn || rc=$?`, which suspends `set -e` for its
# whole body — so a failed assertion does not stop it and must not be masked by
# a later one that passes. Every assertion therefore records itself.
check() {
  local what="$1"
  shift
  if "$@"; then
    note "ok: $what"
    return 0
  fi
  note "NOT ok: $what"
  case_failures=$((case_failures + 1))
  return 1
}

# Runs a command expecting a specific exit code, keeping its output for the
# case to grep.
run_expect() {
  local want="$1" log="$2" got=0
  shift 2
  "$@" >"$log" 2>&1 || got=$?
  if [ "$got" -ne "$want" ]; then
    note "expected exit $want, got $got; last lines of $log:"
    tail -n 8 "$log" | sed 's/^/      /'
    case_failures=$((case_failures + 1))
    return 1
  fi
  return 0
}

upgrade() { "$deploy_dir/upgrade.sh" "$@"; }
rollback() { "$deploy_dir/rollback.sh" "$@"; }
backup() { "$deploy_dir/backup.sh" "$@"; }

# What `deployment.env` pins, and what the containers are actually running. The
# drill asserts on both every time: a rollback that edited the file but left the
# old container up, or restarted a container but left the file pointing at the
# failed release, is a rollback that surprises the next person to run
# `docker compose up`.
pinned() { setting "NEXT_$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')_IMAGE"; }
running() {
  local captured
  captured="$(running_image_ref "$1")" || return 1
  printf '%s\n' "${captured%% *}"
}
on_release() {
  local service="$1" want="$2"
  [ "$(pinned "$service")" = "$want" ] && [ "$(running "$service")" = "$want" ]
}

selected() {
  [ -z "$only" ] && return 0
  case "$1" in *"$only"*) return 0 ;; esac
  return 1
}

run_case() {
  local id="$1" fn="$2" rc=0
  selected "$id" || return 0
  printf '\n--- %s\n' "$id"
  case_failures=0
  "$fn" || rc=$?
  if [ "$rc" -eq 77 ]; then
    skipped=$((skipped + 1))
    results+=("SKIP $id")
  elif [ "$rc" -ne 0 ] || [ "$case_failures" -ne 0 ]; then
    failed=$((failed + 1))
    results+=("FAIL $id")
  else
    passed=$((passed + 1))
    results+=("PASS $id")
  fi
}

# The stack has to exist before most cases mean anything. Whichever case needs
# it first brings it up; `upgrade/first-deploy` is the case that asserts the
# bringing-up worked.
deployed=0
ensure_deployed() {
  case "$deployed" in
    1) return 0 ;;
    -1) return 1 ;;
  esac
  deployed=-1
  run_expect 0 "$workdir/first-deploy.log" \
    upgrade --first-deploy --app-version drill-v1 \
    --web "$web_v1" --worker "$worker_v1" --edge "$edge_v1" || return 1
  deployed=1
}

# --- static cases --------------------------------------------------------------

have_python() { command -v python3 >/dev/null 2>&1; }
compose_json() { compose --profile migrate config --format json; }

case_healthcheck_per_service() {
  have_python || {
    note 'python3 is not installed'
    return 77
  }
  compose_json >"$workdir/compose.json" || return 1
  python3 - "$workdir/compose.json" <<'PY'
import json, sys
config = json.load(open(sys.argv[1]))
missing = []
for name, service in sorted(config['services'].items()):
    # `migrate` is a one-shot that exits; a healthcheck on it has nothing to
    # report. Everything that stays up has to say whether it is working.
    if name == 'migrate':
        continue
    check = service.get('healthcheck')
    if not check or check.get('disable'):
        missing.append(name)
print('  services checked:', ', '.join(n for n in sorted(config['services']) if n != 'migrate'))
if missing:
    print('  NO healthcheck:', ', '.join(missing))
    sys.exit(1)
PY
}

case_memory_budget() {
  have_python || {
    note 'python3 is not installed'
    return 77
  }
  compose_json >"$workdir/compose.json" || return 1
  python3 - "$workdir/compose.json" <<'PY'
import json, re, sys
config = json.load(open(sys.argv[1]))
CAP = 1600 * 1024 * 1024   # the host's budget for the stack: every role at once, under 1.6 GB

def limit(service):
    value = service.get('deploy', {}).get('resources', {}).get('limits', {}).get('memory')
    if value is None:
        return None
    if isinstance(value, int):
        return value
    unit = {'b': 1, 'k': 1024, 'm': 1024 ** 2, 'g': 1024 ** 3}
    match = re.fullmatch(r'(\d+)\s*([bkmgBKMG]?)b?', str(value).strip())
    if not match:
        raise SystemExit(f'  unparsable memory limit: {value!r}')
    return int(match.group(1)) * unit[(match.group(2) or 'b').lower()]

failures, total = [], 0
for name, service in sorted(config['services'].items()):
    value = limit(service)
    if value is None:
        failures.append(f'{name} declares no memory limit')
        continue
    # `migrate` runs while web and worker are stopped, so it reuses their
    # allowance rather than adding to the total.
    if name != 'migrate':
        total += value
    print(f'  {name:<9} {value // 1024 // 1024:>4} MiB')
    # V8 sizes its heap from the *host's* memory, not the cgroup's, so a node
    # container with no explicit heap cap is OOM killed with no diagnostic.
    options = (service.get('environment') or {}).get('NODE_OPTIONS') or ''
    if name in ('web', 'worker', 'migrate') and '--max-old-space-size' not in options:
        failures.append(f'{name} runs node without --max-old-space-size')
print(f'  {"total":<9} {total // 1024 // 1024:>4} MiB of {CAP // 1024 // 1024} MiB')
if total > CAP:
    failures.append(f'the long-running services total {total // 1024 // 1024} MiB')
for failure in failures:
    print('  NOT ok:', failure)
sys.exit(1 if failures else 0)
PY
}

# Nothing tracked may carry a credential. The check reads the *tracked* files
# rather than the working tree, so a local `deployment.env` — gitignored, and
# generated by this very script elsewhere — cannot make it pass or fail for the
# wrong reason.
case_no_secrets_in_repo() {
  local tracked offenders
  tracked="$(git -C "$repo_root" ls-files 'deploy' 'docker' 2>/dev/null || true)"
  [ -n "$tracked" ] || {
    note 'not a git checkout'
    return 77
  }
  offenders="$(printf '%s\n' "$tracked" | while read -r file; do
    grep -InE '^(POSTGRES_PASSWORD|REDIS_PASSWORD)=' "$repo_root/$file" 2>/dev/null |
      grep -v 'CHANGE-ME' | sed "s|^|$file:|" || true
  done)"
  if [ -n "$offenders" ]; then
    printf '%s\n' "$offenders" | sed 's/^/      /'
    case_failures=$((case_failures + 1))
  else
    note 'ok: no tracked file under deploy or docker sets a password'
  fi
  check 'deployment.env is gitignored' \
    git -C "$repo_root" check-ignore -q deploy/deployment.env
}

# The real Traefik overlay, merged the way every script merges it: named by
# its relative file name in the settings and resolved against the deploy
# directory. `compose config` neither creates nor joins a network, so this
# reads the result without the edge going anywhere near `server-internal-net`.
# With the key empty, as in the drill's own settings, the edge must have
# neither the network nor a Traefik label.
case_traefik_overlay_resolves() {
  have_python || {
    note 'python3 is not installed'
    return 77
  }
  local traefik_env="$workdir/traefik.env"
  sed \
    -e 's|^NEXT_COMPOSE_OVERLAYS=.*|NEXT_COMPOSE_OVERLAYS=compose.traefik.yml|' \
    -e 's|^NEXT_HOST=.*|NEXT_HOST=drill.invalid|' \
    -e 's|^NEXT_EDGE_TRUSTED_PROXIES=.*|NEXT_EDGE_TRUSTED_PROXIES=192.0.2.0/24|' \
    "$NEXT_DEPLOYMENT_ENV" >"$traefik_env"
  chmod 600 "$traefik_env"
  if ! (
    settings="$traefik_env"
    require_settings
    compose config --format json
  ) >"$workdir/traefik.json" 2>"$workdir/traefik.err"; then
    sed 's/^/      /' "$workdir/traefik.err"
    return 1
  fi
  compose config --format json >"$workdir/plain.json" || return 1
  python3 - "$workdir/traefik.json" "$workdir/plain.json" <<'PY'
import json, sys
overlaid = json.load(open(sys.argv[1]))['services']['edge']
plain = json.load(open(sys.argv[2]))['services']['edge']
failures = []
if 'server-internal-net' not in (overlaid.get('networks') or {}):
    failures.append('with the overlay the edge is not on server-internal-net')
if 'default' not in (overlaid.get('networks') or {}):
    failures.append('with the overlay the edge left the default network')
labels = overlaid.get('labels') or {}
if labels.get('traefik.enable') != 'true':
    failures.append('with the overlay the edge has no traefik.enable=true')
if labels.get('traefik.http.routers.crmeb-next-https.rule') != 'Host(`drill.invalid`)':
    failures.append('with the overlay the https router is not Host(NEXT_HOST)')
if 'server-internal-net' in (plain.get('networks') or {}):
    failures.append('without the overlay the edge is on server-internal-net')
if any(key.startswith('traefik.') for key in (plain.get('labels') or {})):
    failures.append('without the overlay the edge carries a traefik label')
for failure in failures:
    print('    NOT ok:', failure)
if not failures:
    print('    ok: the overlay adds the network and the routers; without it the edge has neither')
sys.exit(1 if failures else 0)
PY
}

# An overlay the settings name but the directory lacks stops every script
# before it touches anything, rather than surfacing later as "the edge is not
# running".
case_overlay_refuses_missing() {
  local saved="$workdir/settings.before-missing-overlay"
  cp -p "$NEXT_DEPLOYMENT_ENV" "$saved"
  set_setting NEXT_COMPOSE_OVERLAYS 'compose.yml, compose.not-there.yml'
  if run_expect 1 "$workdir/overlay-missing-readyz.log" "$deploy_dir/readyz.sh"; then
    check 'readyz.sh names the missing file' \
      grep -q 'compose.not-there.yml, which does not exist' "$workdir/overlay-missing-readyz.log"
  fi
  if run_expect 1 "$workdir/overlay-missing-upgrade.log" \
    upgrade --dry-run --web "$web_v1" --worker "$worker_v1" --edge "$edge_v1"; then
    check 'upgrade.sh names the missing file' \
      grep -q 'compose.not-there.yml, which does not exist' "$workdir/overlay-missing-upgrade.log"
  fi
  cp -p "$saved" "$NEXT_DEPLOYMENT_ENV"
}

# --- upgrade cases ---------------------------------------------------------------

case_refuses_moving_tag() {
  # A tag can be repointed between the run that passed acceptance and the
  # deploy, which makes the rollback target unidentifiable.
  run_expect 1 "$workdir/moving-tag.log" \
    upgrade --first-deploy --web "$registry/crmeb-next-web:v1" \
    --worker "$worker_v1" --edge "$edge_v1" || return 1
  check 'the refusal names digest pinning' \
    grep -q 'pinned by digest' "$workdir/moving-tag.log"
}

# The three roles are three different images, so a release must name all
# three: a `web` that moved while `worker` did not is a web talking to a worker
# built against a different contract.
case_requires_all_three() {
  local role
  for role in web worker edge; do
    local args=()
    [ "$role" = 'web' ] || args+=(--web "$web_v1")
    [ "$role" = 'worker' ] || args+=(--worker "$worker_v1")
    [ "$role" = 'edge' ] || args+=(--edge "$edge_v1")
    run_expect 1 "$workdir/missing-$role.log" upgrade "${args[@]}" || continue
    check "omitting --$role is refused by name" \
      grep -q "no candidate given for $role" "$workdir/missing-$role.log"
  done
}

case_first_deploy() {
  ensure_deployed || return 1
  check 'the readiness gate passed' grep -q 'readiness gate: passed' "$workdir/first-deploy.log"
  check 'the migrations ran' grep -q 'migration(s) applied' "$workdir/first-deploy.log"
  check 'web is on v1' on_release web "$web_v1"
  check 'worker is on v1' on_release worker "$worker_v1"
  check 'edge is on v1' on_release edge "$edge_v1"
  check 'the edge answers /healthz on the published port' \
    curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:$edge_port/healthz"
  check 'the edge answers /readyz through to the app' \
    curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:$edge_port/readyz"
}

case_dry_run() {
  ensure_deployed || return 1
  local before
  before="$(cat "$NEXT_DEPLOYMENT_ENV")"
  run_expect 0 "$workdir/dry-run.log" \
    upgrade --dry-run --web "$web_v2" --worker "$worker_v2" --edge "$edge_v2" || return 1
  check 'it says it changed nothing' grep -q 'no migration ran' "$workdir/dry-run.log"
  check 'the settings are untouched' [ "$before" = "$(cat "$NEXT_DEPLOYMENT_ENV")" ]
  check 'the stack is still on v1' on_release web "$web_v1"
}

# --- the edge -------------------------------------------------------------------------

# `/admin/(shell)/orders/[id]/page.tsx`, relative to the app directory, is
# `/admin/orders/drill-sample`. Fails for a file under a private folder, which
# is not a route.
route_url() {
  local directory="${1%/*}" segment url=''
  local -a segments
  IFS='/' read -r -a segments <<<"${directory#/}"
  for segment in "${segments[@]}"; do
    case "$segment" in
      '') ;;
      _*) return 1 ;;
      '('*')' | @*) ;;
      '[[...'*']]') ;;
      '['*']') url+='/drill-sample' ;;
      *) url+="/$segment" ;;
    esac
  done
  printf '%s\n' "${url:-/}"
}

# The edge serves the storefront's `index.html` for any path it does not
# proxy, so a Next page left out of `nginx.conf` does not 404: it quietly shows
# the storefront. Every page route, and one route handler per top-level path,
# is requested through the real edge, and none may come back as that file.
#
# `/` is the storefront's on purpose: the Next page there only points at
# `/admin`.
case_edge_proxies_every_page() {
  ensure_deployed || return 1
  local app="$repo_root/apps/web/app" storefront file url prefix response status
  local checked=0 handler_prefixes=' '
  [ -d "$app" ] || {
    note "no Next app at $app"
    return 77
  }
  # Fetched exactly as the routes are below and split the same way, so the
  # comparison cannot differ by a trailing newline that `$(…)` strips from one
  # side only.
  storefront="$(curl -fsS --max-time 10 -w '\n%{http_code}' "http://127.0.0.1:$edge_port/index.html")" || {
    note "NOT ok: the edge did not serve the storefront's index.html"
    return 1
  }
  storefront="${storefront%$'\n'*}"
  while IFS= read -r file; do
    url="$(route_url "${file#"$app"}")" || continue
    [ "$url" != '/' ] || continue
    case "${file##*/}" in
      route.*)
        prefix="${url#/}"
        prefix="${prefix%%/*}"
        case "$handler_prefixes" in *" $prefix "*) continue ;; esac
        handler_prefixes+="$prefix "
        ;;
    esac
    checked=$((checked + 1))
    response="$(curl -sS --max-time 30 -w '\n%{http_code}' "http://127.0.0.1:$edge_port$url" 2>/dev/null || true)"
    status="${response##*$'\n'}"
    if [ -z "$status" ] || [ "$status" = '000' ]; then
      note "NOT ok: $url did not answer (${file#"$repo_root/"})"
      case_failures=$((case_failures + 1))
    elif [ "${response%$'\n'*}" = "$storefront" ]; then
      note "NOT ok: $url is answered by the storefront, not by web (${file#"$repo_root/"})"
      case_failures=$((case_failures + 1))
    fi
  done < <(find "$app" -type f -regextype posix-extended \
    -regex '.*/(page|route)\.(tsx|ts|jsx|js|mdx)' | sort)
  check "$checked route(s) reach web through the edge" [ "$checked" -gt 0 ]
}

# --- backup cases -------------------------------------------------------------------

drill_dump=''

case_backup_verifies_restore() {
  ensure_deployed || return 1
  run_expect 0 "$workdir/backup.log" backup --out "$workdir/drill.sql.gz" || return 1
  drill_dump="$workdir/drill.sql.gz"
  check 'the dump exists and is not empty' test -s "$drill_dump"
  check 'it is mode 600' [ "$(stat -c '%a' "$drill_dump")" = '600' ]
  check 'it was restored and the row counts matched' \
    grep -q 'backup verified' "$workdir/backup.log"
}

# Verification is not "gzip did not error" — it is that the dump restores to
# the same data. A structurally perfect dump that is missing rows is the
# failure mode that costs you the recovery, so the drill removes some and
# requires the verifier to notice.
case_backup_refuses_tampered_dump() {
  [ -n "$drill_dump" ] || {
    note 'no dump from the previous case'
    return 77
  }
  gzip -dc "$drill_dump" >"$workdir/tampered.sql"
  local biggest table rows
  biggest="$(awk '
    /^COPY public\./ { name = $2; rows = 0; next }
    name && $0 == "\\." { print rows, name; name = ""; next }
    name { rows++ }
  ' "$workdir/tampered.sql" | sort -rn | head -n1)"
  rows="${biggest%% *}"
  table="${biggest##* }"
  if [ -z "$table" ] || [ "${rows:-0}" -lt 10 ]; then
    note 'the dump has no table with enough rows to tamper with'
    return 77
  fi
  note "removing 7 of $rows rows from $table"
  awk -v table="$table" '
    $0 ~ "^COPY " table " " { copying = 1; dropped = 0; print; next }
    copying && $0 == "\\." { copying = 0; print; next }
    copying && dropped < 7 { dropped++; next }
    { print }
  ' "$workdir/tampered.sql" | gzip -c >"$workdir/tampered.sql.gz"
  run_expect 1 "$workdir/tampered.log" backup --verify-only "$workdir/tampered.sql.gz" || return 1
  check 'the census diff names the table' \
    grep -q "${table#public.}" "$workdir/tampered.log"
}

case_backup_refuses_truncated_dump() {
  [ -n "$drill_dump" ] || {
    note 'no dump from the previous case'
    return 77
  }
  head -c 4096 "$drill_dump" >"$workdir/truncated.sql.gz"
  run_expect 1 "$workdir/truncated.log" backup --verify-only "$workdir/truncated.sql.gz"
}

# --- the failure paths ----------------------------------------------------------------

# The three ways a release fails, drilled separately: they fail at different
# points, and what the operator has to be told differs at each one.

case_failed_migration() {
  ensure_deployed || return 1
  run_expect 1 "$workdir/bad-migrate.log" \
    upgrade --app-version drill-badmigrate \
    --web "$web_v2" --worker "$worker_badmigrate" --edge "$edge_v2" || return 1
  check 'it says the migration failed' grep -q 'the migration failed' "$workdir/bad-migrate.log"
  check 'a verified dump was taken first' grep -qE '^backup: ' "$workdir/bad-migrate.log"
  check 'web is back on v1' on_release web "$web_v1"
  check 'worker is back on v1' on_release worker "$worker_v1"
  check 'edge is back on v1' on_release edge "$edge_v1"
  check 'the readiness gate still passes' "$deploy_dir/readyz.sh"
}

case_unhealthy_worker() {
  ensure_deployed || return 1
  # The candidate starts, stays up and does no work. A crash would be caught by
  # Docker with no probe at all; this is the failure the probe exists for.
  run_expect 1 "$workdir/broken-worker.log" \
    upgrade --app-version drill-broken \
    --web "$web_v2" --worker "$worker_broken" --edge "$edge_v2" || return 1
  check 'it says the stack did not become healthy' \
    grep -q 'did not become healthy' "$workdir/broken-worker.log"
  # The migration ran before the stack was started, so the operator has to be
  # told the schema moved even though the images did not.
  check 'it reports the schema had already moved' \
    grep -q 'the database is on the NEW schema' "$workdir/broken-worker.log"
  check 'web is back on v1' on_release web "$web_v1"
  check 'worker is back on v1' on_release worker "$worker_v1"
  check 'edge is back on v1' on_release edge "$edge_v1"
  check 'the readiness gate still passes' "$deploy_dir/readyz.sh"
}

# Every container healthy, both probes answering, and the release still refused
# — because the schema it needs is not there. This is what distinguishes the
# readiness gate from the container healthchecks; without this case the gate
# could be a no-op and nothing here would notice.
case_readiness_gate() {
  ensure_deployed || return 1
  export NEXT_READINESS_TABLES='config_values a_table_this_release_forgot'
  local rc=0
  run_expect 1 "$workdir/gate.log" \
    upgrade --app-version drill-gate \
    --web "$web_v2" --worker "$worker_v2" --edge "$edge_v2" || rc=1
  unset NEXT_READINESS_TABLES
  [ "$rc" -eq 0 ] || return 1
  check 'it names the missing table' \
    grep -q 'a_table_this_release_forgot' "$workdir/gate.log"
  check 'the gate is what refused it' \
    grep -q 'readiness gate did not pass' "$workdir/gate.log"
  check 'web is back on v1' on_release web "$web_v1"
  check 'worker is back on v1' on_release worker "$worker_v1"
  check 'edge is back on v1' on_release edge "$edge_v1"
}

# --- the happy path, and the way back ---------------------------------------------------

case_deploys_v2() {
  ensure_deployed || return 1
  run_expect 0 "$workdir/upgrade-v2.log" \
    upgrade --app-version drill-v2 \
    --web "$web_v2" --worker "$worker_v2" --edge "$edge_v2" || return 1
  check 'web is on v2' on_release web "$web_v2"
  check 'worker is on v2' on_release worker "$worker_v2"
  check 'edge is on v2' on_release edge "$edge_v2"
  check 'it recorded v1 as the rollback target' grep -q "$web_v1" "$workdir/upgrade-v2.log"
  check 'the readiness gate passed' grep -q 'readiness gate: passed' "$workdir/upgrade-v2.log"
}

case_rollback_refuses_unavailable() {
  local before zeros
  before="$(cat "$NEXT_DEPLOYMENT_ENV")"
  zeros="$(printf '0%.0s' $(seq 1 64))"
  run_expect 1 "$workdir/rollback-bad.log" \
    rollback --web "$registry/crmeb-next-web@sha256:$zeros" \
    --worker "$worker_v1" --edge "$edge_v1" || return 1
  check 'the settings were not touched' [ "$before" = "$(cat "$NEXT_DEPLOYMENT_ENV")" ]
  check 'the stack is still serving' "$deploy_dir/readyz.sh"
}

case_rollback_last_upgrade() {
  # Only meaningful after the successful v2 deploy, which is what wrote the
  # manifest this case reads.
  grep -q "$web_v2" "$NEXT_DEPLOYMENT_ENV" || {
    note 'the stack is not on v2 (select the v2 case too, or run without --only)'
    return 77
  }
  run_expect 0 "$workdir/rollback.log" rollback --last-upgrade || return 1
  check 'web is back on v1' on_release web "$web_v1"
  check 'worker is back on v1' on_release worker "$worker_v1"
  check 'edge is back on v1' on_release edge "$edge_v1"
  check 'the readiness gate passes on the rolled-back stack' "$deploy_dir/readyz.sh"
}

# --- the overlay -------------------------------------------------------------------------

edge_on_network() {
  local networks
  networks="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
    "$(compose ps -q edge)" 2>/dev/null)" || return 1
  case " $networks " in *" $1 "*) return 0 ;; esac
  return 1
}
edge_off_network() { ! edge_on_network "$1"; }
edge_labelled() {
  [ "$(docker inspect -f '{{index .Config.Labels "crmeb-next-drill.overlay"}}' \
    "$(compose ps -q edge)" 2>/dev/null)" = 'applied' ]
}

# Production runs `compose.traefik.yml` on top of `compose.yml`, and an upgrade
# or a rollback that recreated the edge from `compose.yml` alone would take the
# site off the router. With an overlay named in the settings, both have to
# leave the edge on the overlay's network and with its labels. The overlay here
# is a stand-in of the same shape, a second external network and a label, for
# the reason given at the top of this file.
case_overlay_kept() {
  ensure_deployed || return 1
  on_release web "$web_v1" || {
    note 'the stack is not on v1 (run without --only, or together with the v1 cases)'
    return 77
  }
  local overlay="$workdir/compose.drill-front.yml"
  docker network inspect "$overlay_network" >/dev/null 2>&1 ||
    docker network create "$overlay_network" >/dev/null || return 1
  cat >"$overlay" <<YAML
services:
  edge:
    networks:
      - default
      - drill-front
    labels:
      - crmeb-next-drill.overlay=applied
networks:
  drill-front:
    name: $overlay_network
    external: true
YAML
  set_setting NEXT_COMPOSE_OVERLAYS "$overlay"

  run_expect 0 "$workdir/overlay-upgrade.log" \
    upgrade --app-version drill-overlay \
    --web "$web_v2" --worker "$worker_v2" --edge "$edge_v2" || return 1
  check 'the upgrade put the edge on v2' on_release edge "$edge_v2"
  check 'after the upgrade the edge is on the overlay network' edge_on_network "$overlay_network"
  check 'after the upgrade the edge is still on the default network' \
    edge_on_network "${NEXT_PROJECT}_default"
  check 'after the upgrade the edge carries the overlay label' edge_labelled

  run_expect 0 "$workdir/overlay-rollback.log" rollback --last-upgrade || return 1
  check 'the rollback put the edge back on v1' on_release edge "$edge_v1"
  check 'after the rollback the edge is on the overlay network' edge_on_network "$overlay_network"
  check 'after the rollback the edge carries the overlay label' edge_labelled
  check 'readyz.sh passes with the overlay' "$deploy_dir/readyz.sh"

  # The other way round: with the key emptied, an `up` takes the edge off the
  # overlay. That is how the site leaves the router, and it shows the checks
  # above can fail.
  set_setting NEXT_COMPOSE_OVERLAYS ''
  compose up -d --wait --wait-timeout 180 >/dev/null 2>&1 || true
  check 'with the key emptied, an up takes the edge off the overlay network' \
    edge_off_network "$overlay_network"
  check 'and the stack still serves' "$deploy_dir/readyz.sh"
}

# --- run ---------------------------------------------------------------------------------

step 'running the cases'

for index in "${!CASE_IDS[@]}"; do
  run_case "${CASE_IDS[$index]}" "${CASE_FNS[$index]}"
done

step 'results'
printf '%s\n' "${results[@]:-<none selected>}"
printf '\n%s passed, %s failed, %s skipped\n' "$passed" "$failed" "$skipped"
[ "$failed" -eq 0 ]
