#!/usr/bin/env bash
# Release a commit to the shop's host, from a machine with the repository.
#
#   deploy/ship.sh [<commit>] [--dry-run] [--first-deploy] [--host <ssh destination>] [--dir <path>]
#   deploy/ship.sh status | backup … | rollback …   [--host …] [--dir …]
#
# <commit> defaults to the tip of origin/master. In order, refusing to continue
# when a step cannot be proven:
#
#   1. the commit is on origin/master, and the `ci` workflow's push run for it
#      concluded `success` (asked with `gh`);
#   2. the three images CI published for it, `sha-<commit>`, are resolved to
#      digests by the host (`shop resolve`), so nobody copies a digest;
#   3. the runtime files — `git archive <commit> deploy`, without the drill,
#      the docs and this script — are staged on the host, and that staged
#      `shop upgrade --dry-run` runs against the host's settings;
#   4. the files are synced into the release directory. A file the previous
#      release shipped and this one does not is removed; `data/shipped.list`
#      on the host is what makes that exact. `deployment.env`, `data/` and
#      `REVISION` are never touched;
#   5. `shop upgrade` runs for real, detached from this connection, so a
#      dropped SSH session cannot kill it halfway; its output is streamed and
#      its exit code is this script's;
#   6. `REVISION` names the commit, written only after the upgrade passed;
#   7. from here: `https://<NEXT_HOST>/` answers 2xx and `http://<NEXT_HOST>/`
#      redirects to https. The host name is read with `shop hostname`, which
#      prints that one setting and only while the Traefik overlay is applied.
#
# A release that changes only the Compose files goes through the same command:
# the digests equal what runs, nothing is stopped, and `up -d` recreates what
# the files changed.
#
# `status`, `backup` and `rollback` run `shop <command>` on the host with the
# arguments given, so this machine is the only place anyone types a command:
#
#   deploy/ship.sh status
#   deploy/ship.sh rollback --last-upgrade
#
# Where to: `--host`/`--dir`, else SHIP_HOST/SHIP_DIR from the environment,
# else from `deploy/ship.local.env` (gitignored; see ship.local.env.example).
# SHIP_HOST=local runs the host side on this machine, in SHIP_DIR, with no SSH:
# that is how the drill ships. SHIP_REMOTE and SHIP_BRANCH (origin, master)
# name where a release must come from.
#
# Exit codes: 0 shipped · 1 the upgrade failed and the previous images are
#             running again · 2 misuse · 3 the upgrade and its rollback failed:
#             a person is needed · 4 refused before anything on the host
#             changed · 5 deployed, but the site does not answer as it should
#             from outside. A forwarded command exits with its own code.

# shellcheck disable=SC2016  # the host scripts below are single-quoted on
# purpose: they are expanded by bash on the host, from their own arguments.
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf '%s\n' "$*"; }
warn() { printf '%s\n' "$*" >&2; }
misuse() {
  warn "$*"
  exit 2
}
# Before the release directory is touched: nothing on the host changed.
refuse() {
  warn "refused: $*"
  exit 4
}

# --- where to --------------------------------------------------------------------

# The environment wins; the local file fills in what it leaves unset. The file
# is read, not sourced: it names a host, and nothing in it should run.
local_setting() {
  local key="$1" file="$here/ship.local.env" value
  [ -f "$file" ] || return 0
  value="$(sed -n "s/^$key=//p" "$file" | tail -n1)"
  value="${value#[\"\']}"
  printf '%s\n' "${value%[\"\']}"
}

host="${SHIP_HOST:-$(local_setting SHIP_HOST)}"
dir="${SHIP_DIR:-$(local_setting SHIP_DIR)}"
remote="${SHIP_REMOTE:-$(local_setting SHIP_REMOTE)}"
remote="${remote:-origin}"
branch="${SHIP_BRANCH:-$(local_setting SHIP_BRANCH)}"
branch="${branch:-master}"

action='release'
case "${1-}" in
  status | backup | rollback)
    action="$1"
    shift
    ;;
  help | -h | --help)
    sed -n '2,52p' "$0"
    exit 0
    ;;
esac

commit=''
dry_run=0
first_deploy=0
forward=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      host="${2:?--host needs a destination}"
      shift
      ;;
    --host=*) host="${1#*=}" ;;
    --dir)
      dir="${2:?--dir needs a path}"
      shift
      ;;
    --dir=*) dir="${1#*=}" ;;
    *)
      if [ "$action" != 'release' ]; then
        forward+=("$1")
      else
        case "$1" in
          --dry-run) dry_run=1 ;;
          --first-deploy) first_deploy=1 ;;
          -*) misuse "unknown argument: $1" ;;
          *)
            [ -z "$commit" ] || misuse 'give one commit'
            commit="$1"
            ;;
        esac
      fi
      ;;
  esac
  shift
done

[ -n "$host" ] || misuse 'no host: pass --host, set SHIP_HOST, or fill in deploy/ship.local.env'
[ -n "$dir" ] || misuse 'no release directory: pass --dir, set SHIP_DIR, or fill in deploy/ship.local.env'
case "$dir" in /*) ;; *) misuse "the release directory must be an absolute path: $dir" ;; esac

# --- the host ----------------------------------------------------------------------

quoted_args() {
  local arg out=''
  for arg in "$@"; do out+=" $(printf '%q' "$arg")"; done
  printf '%s' "$out"
}

# Runs a bash script on the host with positional arguments. The script travels
# on stdin, so it is never re-parsed by the host's login shell.
on_host() {
  local script="$1"
  shift
  if [ "$host" = 'local' ]; then
    bash -s -- "$@" <<<"$script"
  else
    # shellcheck disable=SC2029  # expanded here on purpose: quoted arguments.
    ssh -o BatchMode=yes "$host" "bash -s --$(quoted_args "$@")" <<<"$script"
  fi
}

# A `shop` command on the host, interactive: `rollback --restore` asks before
# it overwrites anything, so it needs a terminal.
shop_interactive() {
  if [ "$host" = 'local' ]; then
    NEXT_DEPLOYMENT_ENV="$dir/deployment.env" "$dir/shop" "$@"
  else
    # shellcheck disable=SC2029  # expanded here on purpose: quoted arguments.
    ssh -t "$host" "NEXT_DEPLOYMENT_ENV=$(printf '%q' "$dir/deployment.env") $(printf '%q' "$dir/shop")$(quoted_args "$@")"
  fi
}

if [ "$action" != 'release' ]; then
  code=0
  shop_interactive "$action" "${forward[@]}" || code=$?
  exit "$code"
fi

# --- 1. the commit, and CI ---------------------------------------------------------

repo="$(git -C "$here" rev-parse --show-toplevel)"
prefix="$(git -C "$here" rev-parse --show-prefix)"
prefix="${prefix%/}"
cd "$repo"

git fetch --quiet "$remote" "$branch" || refuse "could not fetch $branch from $remote"
tip="$(git rev-parse --verify --quiet 'FETCH_HEAD^{commit}')" || refuse "$remote has no $branch"
sha="$(git rev-parse --verify --quiet "${commit:-$tip}^{commit}")" ||
  refuse "not a commit: $commit"
git merge-base --is-ancestor "$sha" "$tip" ||
  refuse "$sha is not on $remote/$branch; only what $branch holds is released"
say "commit: $sha ($(git log -1 --format=%s "$sha"))"

runs="$(gh run list --workflow ci.yml --commit "$sha" --event push --limit 20 \
  --json status,conclusion --jq '.[] | .status + " " + .conclusion')" ||
  refuse "could not ask GitHub about CI for $sha (is gh signed in?)"
if grep -qx 'completed success' <<<"$runs"; then
  say 'CI: passed'
elif [ -z "$runs" ]; then
  refuse "CI has no push run for $sha. The workflow ignores commits that change only docs/** or *.md, and publishes no images for them: ship the newest commit CI built."
elif grep -qv '^completed ' <<<"$runs"; then
  refuse "CI is still running for $sha; ship it when it has passed"
else
  refuse "CI did not pass for $sha: $(sort -u <<<"$runs" | paste -sd ',' -)"
fi

# --- what ships ----------------------------------------------------------------------

# The host runs `shop` and what it reads; the drill, the docs, this script and
# its settings stay here.
shipped() {
  case "${1#"$prefix"/}" in
    rehearsal/* | *.md | ship.sh | ship.local.env* | .gitignore) return 1 ;;
    *.test.sh | */test/* | */tests/* | test/* | tests/*) return 1 ;;
    deployment.env | REVISION | data/*) return 1 ;;
  esac
}

files=()
while IFS= read -r file; do
  shipped "$file" && files+=(":(literal)$file")
done < <(git ls-tree -r --name-only "$sha" -- "$prefix")
[ "${#files[@]}" -gt 0 ] || refuse "$sha has nothing under $prefix/ to ship"
strip="$(tr -cd '/' <<<"$prefix/" | wc -c)"

# --- 2 and 3. stage on the host, resolve the digests, dry-run -------------------------

on_host '[ -f "$1/deployment.env" ]' "$dir" ||
  refuse "$host:$dir has no deployment.env; configure the host first (deploy/README.md, First deploy)"

stage="$(on_host 'mktemp -d "${TMPDIR:-/tmp}/shop-release.XXXXXX"')" ||
  refuse "could not make a staging directory on $host"
cleanup() { on_host 'rm -rf -- "$1"' "$stage" >/dev/null 2>&1 || true; }
trap cleanup EXIT

git archive --format=tar "$sha" -- "${files[@]}" |
  on_host 'tar -x -C "$1" --strip-components="$2"' "$stage" "$strip" ||
  refuse "could not stage the release files on $host"

say ''
say "resolving the images CI published for $sha"
resolved="$(on_host 'NEXT_DEPLOYMENT_ENV="$1/deployment.env" "$2/shop" resolve "$3"' "$dir" "$stage" "$sha")" ||
  refuse "the host could not resolve the images for $sha"
web="$(sed -n 's/^web=//p' <<<"$resolved")"
worker="$(sed -n 's/^worker=//p' <<<"$resolved")"
edge="$(sed -n 's/^edge=//p' <<<"$resolved")"
for ref in "$web" "$worker" "$edge"; do
  [[ "$ref" =~ @sha256:[a-f0-9]{64}$ ]] || refuse "the host resolved a reference that is not a digest: '$ref'"
done
say "  web:    $web"
say "  worker: $worker"
say "  edge:   $edge"

# The one place that writes into the release directory. `plan` prints what
# `apply` would do; `apply` does it. Each file is copied beside its target and
# renamed over it, so a `shop` that is running reads either the old file or the
# new one, never half of each.
sync_script='set -Eeuo pipefail
stage="$1" dir="$2" mode="$3"
list="$dir/data/shipped.list"
cd "$stage"
new="$(find . \( -type f -o -type l \) -printf "%P\n" | LC_ALL=C sort)"
while IFS= read -r f; do
  case "$f" in
    deployment.env | REVISION | data | data/*)
      printf "refusing: the release carries %s, which belongs to the host\n" "$f" >&2
      exit 1
      ;;
  esac
done <<<"$new"
old=""
[ ! -f "$list" ] || old="$(LC_ALL=C sort "$list")"
removed="$(LC_ALL=C comm -23 <(printf "%s\n" "$old" | sed "/^\$/d") <(printf "%s\n" "$new"))"
changed=()
while IFS= read -r f; do
  if [ ! -e "$dir/$f" ]; then
    printf "  + %s\n" "$f"
    changed+=("$f")
  elif ! cmp -s "$f" "$dir/$f" || [ "$(stat -c %a "$f")" != "$(stat -c %a "$dir/$f")" ]; then
    printf "  ~ %s\n" "$f"
    changed+=("$f")
  fi
done <<<"$new"
gone=()
while IFS= read -r f; do
  case "$f" in "" | deployment.env | REVISION | data | data/*) continue ;; esac
  printf "  - %s\n" "$f"
  gone+=("$f")
done <<<"$removed"
[ "${#changed[@]}" -gt 0 ] || [ "${#gone[@]}" -gt 0 ] || printf "  (no file changes)\n"
[ "$mode" = apply ] || exit 0
mkdir -p "$dir/data"
for f in "${changed[@]}"; do
  mkdir -p "$dir/$(dirname "$f")"
  cp -p "$f" "$dir/$f.shipping"
  mv -f "$dir/$f.shipping" "$dir/$f"
done
for f in "${gone[@]}"; do
  rm -f "$dir/$f"
  parent="$(dirname "$f")"
  [ "$parent" = . ] || (cd "$dir" && rmdir -p --ignore-fail-on-non-empty "$parent" 2>/dev/null) || true
done
printf "%s\n" "$new" >"$list.shipping"
mv -f "$list.shipping" "$list"
'

say ''
say "files, against $dir:"
on_host "$sync_script" "$stage" "$dir" plan || refuse 'the release files cannot be synced'

upgrade_args=(upgrade --app-version "$sha" --web "$web" --worker "$worker" --edge "$edge")
[ "$first_deploy" -eq 0 ] || upgrade_args+=(--first-deploy)

say ''
say 'dry run of the upgrade, with this release'\''s files and the host'\''s settings'
code=0
on_host 'dir="$1" stage="$2"; shift 2; NEXT_DEPLOYMENT_ENV="$dir/deployment.env" "$stage/shop" "$@"' \
  "$dir" "$stage" "${upgrade_args[@]}" --dry-run || code=$?
if [ "$dry_run" -eq 1 ]; then
  [ "$code" -ne 0 ] || say "dry run: $host:$dir was not changed"
  exit "$code"
fi
[ "$code" -eq 0 ] || refuse "the dry run failed (exit $code)"

# --- 4. sync -------------------------------------------------------------------------

say ''
say "syncing the release files into $dir"
on_host "$sync_script" "$stage" "$dir" apply >/dev/null || {
  warn "the sync into $dir failed part-way. Nothing was deployed; ship again."
  exit 1
}

# --- 5. upgrade ------------------------------------------------------------------------

# Detached: the upgrade's output goes to a log on the host and this connection
# only follows it. If the connection drops, the upgrade finishes regardless and
# its log and manifest say how it ended.
run_script='dir="$1" log="$2"
shift 2
mkdir -p "${log%/*}"
rm -f "$log.exit"
: >"$log"
(
  trap "" HUP
  NEXT_DEPLOYMENT_ENV="$dir/deployment.env" "$dir/shop" "$@" >"$log" 2>&1 </dev/null
  printf "%s\n" "$?" >"$log.exit"
) &
pid=$!
tail -n +1 -f --pid="$pid" "$log"
wait "$pid" 2>/dev/null || true
exit "$(cat "$log.exit" 2>/dev/null || printf 3)"
'
log="$dir/data/releases/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}.log"
say ''
say "upgrading (log on the host: $log)"
code=0
on_host "$run_script" "$dir" "$log" "${upgrade_args[@]}" || code=$?
if [ "$code" -ne 0 ]; then
  warn ''
  if [ "$code" -eq 255 ] && [ "$host" != 'local' ]; then
    warn "the connection to $host was lost. The upgrade carries on there; its log is"
    warn "  $log"
    warn "and \`deploy/ship.sh status\` shows how it ended."
    exit 3
  fi
  warn "the upgrade did not deploy $sha (exit $code). REVISION still names the previous release;"
  warn "the files in $dir are this release's."
  exit "$code"
fi

# --- 6. REVISION ---------------------------------------------------------------------------

on_host 'printf "%s\n" "$2" >"$1/REVISION.shipping" && mv -f "$1/REVISION.shipping" "$1/REVISION"' \
  "$dir" "$sha"
say "REVISION: $sha"

# --- 7. from outside -----------------------------------------------------------------------

name="$(on_host 'NEXT_DEPLOYMENT_ENV="$1/deployment.env" "$1/shop" hostname' "$dir")" || name=''
if [ -z "$name" ]; then
  say ''
  say 'no public host name (the Traefik overlay is not applied); the readiness gate was the last check'
  exit 0
fi

say ''
say "checking https://$name/ and http://$name/ from here"
failed=0
status="$(curl -sS -o /dev/null --max-time 20 -w '%{http_code}' "https://$name/" 2>&1)" || status="${status:-error}"
case "$status" in
  2??) say "  https://$name/ answers $status" ;;
  *)
    warn "  https://$name/ answers $status, not 2xx"
    failed=1
    ;;
esac
answer="$(curl -sS -o /dev/null --max-time 20 -w '%{http_code} %{redirect_url}' "http://$name/" 2>&1)" ||
  answer="${answer:-error}"
case "$answer" in
  30?' https://'*) say "  http://$name/ redirects: $answer" ;;
  *)
    warn "  http://$name/ answers '$answer', not a redirect to https"
    failed=1
    ;;
esac
[ "$failed" -eq 0 ] || exit 5
say ''
say "shipped $sha"
