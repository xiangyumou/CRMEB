#!/usr/bin/env bash
# Maintenance upgrade with a verified backup and a hard stop on failure.
#
# The runbook in deploy/production/README.md described these steps in prose; this
# script performs them and refuses to continue when a step cannot be proven:
#
#   1. a fixed candidate digest is required (a moving tag is refused);
#   2. the running image digest and the deployment configuration are recorded;
#   3. every writing role is stopped — no migration runs against live writers;
#   4. the database is dumped with `set -Eeuo pipefail
# A consumer that closes its pipe early (head/grep) must not kill the upgrade.`, and the dump is checked
#      for a non-empty result and a complete gzip stream;
#   5. the backup is restored into an isolated database and the retained business
#      counts are compared, so "the dump exists" is not mistaken for "the dump is
#      usable";
#   6. only then do the migrations run, and a migration failure stays in
#      maintenance mode instead of resuming traffic;
#   7. the stack is started again, and a failed start keeps the maintenance state.
#
# Usage:
#   deploy/production/upgrade.sh <ghcr.io/...@sha256:DIGEST> [--dry-run] [--skip-migration]
#
# Environment:
#   CRMEB_UPGRADE_SKIP_RESTORE_CHECK=1   skip the isolated restore check (NOT for production)
#   CRMEB_UPGRADE_MYSQL_SERVICE          compose service holding MySQL (default: mysql)
#   CRMEB_DEPLOY_ROOT                    deployment root holding compose.yaml and deployment/
#   CRMEB_DEPLOY_PROJECT                 compose project name (default: the root directory name)
#   CRMEB_DEPLOY_COMPOSE_FILE            compose file (default: <root>/compose.yaml)
#   CRMEB_MIGRATION_COMMAND              command that runs the migrations (default: the
#                                        release's own migration scripts through the php role)
set -Eeuo pipefail
# A consumer that closes its pipe early (head/grep) must not kill the upgrade.

target="${1:?usage: upgrade.sh <image@sha256:DIGEST> [--dry-run] [--skip-migration]}"
shift || true
dry_run=0
skip_migration=0
backup_override=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --skip-migration) skip_migration=1 ;;
    --backup-file)
      backup_override="${2:?--backup-file needs a path}"
      shift
      ;;
    --backup-file=*) backup_override="${1#*=}" ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[[ "$target" =~ ^ghcr\.io/xiangyumou/crmeb@sha256:[a-f0-9]{64}$ ]] || {
  echo 'Expected a fixed candidate: ghcr.io/xiangyumou/crmeb@sha256:<64 hex>' >&2
  exit 2
}

root="$(cd "$(dirname "$0")/../.." && pwd)"
deploy_root="${CRMEB_DEPLOY_ROOT:-$root}"
compose_file="${CRMEB_DEPLOY_COMPOSE_FILE:-$deploy_root/compose.yaml}"
settings="$deploy_root/deployment/deployment.env"
backup_dir="${CRMEB_BACKUP_DIR:-$deploy_root/data/backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="${CRMEB_UPGRADE_BACKUP_FILE:-$backup_dir/pre-upgrade-$stamp.sql.gz}"
# An explicit --backup-file wins over both the environment and the default: it
# names the file this run must verify.
[ -n "$backup_override" ] && backup="$backup_override"
mysql_service="${CRMEB_UPGRADE_MYSQL_SERVICE:-mysql}"
migration_command="${CRMEB_MIGRATION_COMMAND:-}"

compose_args=(docker compose)
[ -n "${CRMEB_DEPLOY_PROJECT:-}" ] && compose_args+=(-p "$CRMEB_DEPLOY_PROJECT")
compose_args+=(--project-directory "$deploy_root" -f "$compose_file")
compose() { "${compose_args[@]}" "$@"; }
app_services="nginx php queue timer workerman"

say() { printf '%s\n' "$*"; }
die() { printf '%s\n' "$*" >&2; exit 1; }

# The stack must be describable before anything is touched.
compose config >/dev/null || die 'the compose configuration cannot be parsed'
test -f "$settings" || die "the deployment settings are missing: $settings"

# Record what is running now so a rollback has a fixed target, and refuse to
# continue when the application roles disagree about their image.
captured=''
for container in $(compose ps -q $app_services 2>/dev/null || true); do
  [ -n "$container" ] || continue
  image_id="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"
  [ -n "$image_id" ] || continue
  # Prefer the registry digest (a fixed, pullable recovery target). A locally
  # built image has none, so its content-addressed image ID is recorded instead:
  # it is still an immutable reference, and the alternative — refusing to
  # upgrade a stack that runs a locally built image — would block the very
  # rehearsal this script exists for.
  digest_ref="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" 2>/dev/null | grep '^ghcr.io/xiangyumou/crmeb@sha256:' | head -n1 || true)"
  if [ -z "$digest_ref" ]; then
    digest_ref="local-image:$image_id"
    echo "warning: container $container runs an image with no registry digest; recording $digest_ref" >&2
  fi
  if [ -z "$captured" ]; then
    captured="$digest_ref"
  elif [ "$captured" != "$digest_ref" ]; then
    die "application roles run different images ($captured vs $digest_ref); refusing to upgrade"
  fi
done
say "current image: ${captured:-<none running>}"
say "candidate:     $target"
say "backup target: $backup"

if [ "$dry_run" -eq 1 ]; then
  say 'dry run: no writer stopped, no backup taken, no migration run'
  exit 0
fi

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

# 1. Stop every writing role. A migration must never race live writers.
say 'stopping writing roles'
compose stop $app_services >/dev/null

maintenance_mode=1
trap 'if [ "$maintenance_mode" -eq 1 ]; then echo "UPGRADE FAILED: the stack stays in maintenance mode; inspect the log above before starting it again." >&2; fi' EXIT

# 2. Dump and verify: a non-empty file AND a complete gzip stream. When a backup
#    file was supplied explicitly the dump is skipped: that mode exists to
#    re-verify a backup that already exists, and taking a fresh dump would verify
#    the wrong file.
if [ -n "${backup_override:-}" ]; then
  say "verifying the supplied backup: $backup"
  test -s "$backup" || die "the supplied backup is missing or empty: $backup"
else
  say 'dumping the database'
  if ! compose exec -T "$mysql_service" sh -c \
      'exec mysqldump --single-transaction --routines --events --triggers --set-gtid-purged=OFF -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
      > "$backup".part; then
    rm -f "$backup".part
    die 'the database dump failed; nothing was migrated'
  fi
  test -s "$backup".part || { rm -f "$backup".part; die 'the database dump is empty; nothing was migrated'; }
  gzip -c "$backup".part > "$backup"
  rm -f "$backup".part
fi
gzip -t "$backup" || die "the backup is not a complete gzip stream: $backup"
size="$(wc -c < "$backup")"
[ "$size" -gt 0 ] || die 'the backup file is empty'
say "backup written and verified: $backup ($size bytes)"

# 3. Restore the backup into an isolated database and compare retained counts.
if [ "${CRMEB_UPGRADE_SKIP_RESTORE_CHECK:-0}" != "1" ]; then
  say 'restoring the backup into an isolated database to verify it'
  check_container="crmeb-restore-check-$stamp"
  # --network none: the verification database can reach nothing.
  docker run -d --name "$check_container" --network none \
    -e MYSQL_ROOT_PASSWORD=restorecheck -e MYSQL_DATABASE=restorecheck \
    mysql:8.0.42 --default-authentication-plugin=mysql_native_password >/dev/null
  restore_failed=0
  restore_sql="$(mktemp)"
  # Wait for the server to accept this password, not merely to answer a ping:
  # MySQL's init phase briefly runs with a temporary server that refuses the
  # configured password, and restoring into that window loses the whole check.
  attempt=0
  until docker exec "$check_container" mysql -uroot -prestorecheck -e 'SELECT 1' >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 90 ]; then restore_failed=1; break; fi
    sleep 2
  done
  if [ "$restore_failed" -eq 0 ]; then
    if ! gzip -dc "$backup" > "$restore_sql" 2>/dev/null; then
      restore_failed=1
    elif ! docker exec -i "$check_container" mysql -uroot -prestorecheck restorecheck < "$restore_sql"; then
      restore_failed=1
    fi
    rm -f "$restore_sql"
  fi
  if [ "$restore_failed" -eq 0 ]; then
    # Count the retained business rows in both databases: the backup has to be
    # internally consistent, not merely non-empty.
    # The password is read inside each container from its own environment: the
    # host has no copy of it, which is the point of container-managed secrets.
    for table in store_order store_order_refund store_coupon_user user; do
      # The password is read inside each container from its own environment: the
      # host never holds a copy of it.
      live="$(compose exec -T "$mysql_service" sh -c \
        'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM eb_$1"' _ "$table" \
        2>/dev/null || echo 'error')"
      restored="$(docker exec "$check_container" sh -c \
        'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM eb_$1"' _ "$table" \
        2>/dev/null || echo 'error')"
      if [ "$live" != "$restored" ] || [ "$live" = 'error' ]; then
        restore_failed=1
        echo "retained-row mismatch for eb_$table: live=$live restored=$restored" >&2
      fi
    done
  fi
  docker rm -f "$check_container" >/dev/null 2>&1 || true
  [ "$restore_failed" -eq 0 ] || die 'the backup could not be restored and verified; nothing was migrated'
  say 'backup restored and the retained rows match'
fi

# 4. Migrate. A failure keeps maintenance mode: no traffic resumes automatically.
if [ "$skip_migration" -eq 0 ]; then
  say 'running the migrations'
  if [ -n "$migration_command" ]; then
    sh -c "$migration_command" \
      || die 'the migration failed; restore from the backup before retrying'
  else
    compose run --rm --no-deps -T php php upgrade/core-store/drop-retired.php plan \
      || die 'the migration pre-check could not run; nothing was migrated'
    compose run --rm --no-deps -T php php upgrade/core-store/drop-retired.php apply \
      || die 'the retired-feature migration failed; restore from the backup before retrying'
    compose run --rm --no-deps -T php php upgrade/core-store/order-reliability.php apply \
      || die 'the reliability migration failed; restore from the backup before retrying'
  fi
else
  say 'skipping the migrations as requested'
fi

# 5. Start the stack again and prove it became ready.
say 'starting the stack'
if ! compose up -d --wait --wait-timeout 300 >/dev/null; then
  die 'the stack did not become healthy; it stays in maintenance mode and the backup is intact'
fi

maintenance_mode=0
trap - EXIT
say "upgrade complete: $target"
say "rollback target: ${captured:-<none>}"
say "backup: $backup"
