#!/usr/bin/env bash
# Maintenance upgrade with a verified backup and a hard stop on failure.
#
# The runbook in deploy/production/README.md described these steps in prose; this
# script performs them and refuses to continue when a step cannot be proven:
#
#   1. a fixed candidate digest is required (a moving tag is refused);
#   2. the running image digest and the deployment configuration are recorded;
#   3. every writing role is stopped — no migration runs against live writers;
#   4. the database dump must succeed, and the dump is checked
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

image_repository="${CRMEB_IMAGE_REPOSITORY:-ghcr.io/xiangyumou/crmeb}"
[[ "$target" =~ ^[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64}$ ]] || {
  echo "Expected a fixed candidate: ${image_repository}@sha256:<64 hex>" >&2
  exit 2
}
case "$target" in
  "$image_repository"@sha256:*) ;;
  *) echo "Candidate repository does not match CRMEB_IMAGE_REPOSITORY ($image_repository): $target" >&2; exit 2 ;;
esac

root="$(cd "$(dirname "$0")/../.." && pwd)"
deploy_root="${CRMEB_DEPLOY_ROOT:-$root}"
compose_file="${CRMEB_DEPLOY_COMPOSE_FILE:-$deploy_root/compose.yaml}"
settings="$deploy_root/deployment/deployment.env"
backup_dir="${CRMEB_BACKUP_DIR:-$deploy_root/data/backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
backup="${CRMEB_UPGRADE_BACKUP_FILE:-$backup_dir/pre-upgrade-$stamp.sql.gz}"
# An explicit --backup-file wins over both the environment and the default: it
# names the file this run must verify.
[ -n "$backup_override" ] && backup="$backup_override"
mysql_service="${CRMEB_UPGRADE_MYSQL_SERVICE:-mysql}"
migration_command="${CRMEB_MIGRATION_COMMAND:-}"
db_prefix="${CRMEB_DB_PREFIX:-eb_}"

[[ "$db_prefix" =~ ^[a-zA-Z0-9_]+$ ]] || { echo "invalid database prefix" >&2; exit 2; }

compose_args=(docker compose)
[ -n "${CRMEB_DEPLOY_PROJECT:-}" ] && compose_args+=(-p "$CRMEB_DEPLOY_PROJECT")
compose_args+=(--project-directory "$deploy_root" -f "$compose_file" --env-file "$settings")
compose() { "${compose_args[@]}" "$@"; }
app_services="nginx php queue timer workerman"

say() { printf '%s\n' "$*"; }
die() { printf '%s\n' "$*" >&2; exit 1; }

# The stack must be describable before anything is touched.
test -f "$settings" || die "the deployment settings are missing: $settings"
grep -q '^CRMEB_IMAGE=' "$settings" || die "CRMEB_IMAGE is missing from the deployment settings"
compose config >/dev/null || die 'the compose configuration cannot be parsed'

# Pull and pin the exact candidate before any writer is stopped. One-off
# migrations and every restarted role then resolve the same immutable image.
docker pull "$target" >/dev/null || die "could not pull candidate $target"
docker image inspect "$target" >/dev/null 2>&1 || die "candidate is not available locally: $target"

# Record what is running now so a rollback has a fixed target, and refuse to
# continue when the application roles disagree about their image.
captured=''
captured_id=''
captured_count=0
for container in $(compose ps -q $app_services 2>/dev/null || true); do
  [ -n "$container" ] || continue
  captured_count=$((captured_count + 1))
  image_id="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"
  [ -n "$image_id" ] || continue
  # Prefer the registry digest (a fixed, pullable recovery target). A locally
  # built image has none, so its content-addressed image ID is recorded instead:
  # it is still an immutable reference, and the alternative — refusing to
  # upgrade a stack that runs a locally built image — would block the very
  # rehearsal this script exists for.
  digest_ref="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" 2>/dev/null | grep -F "${image_repository}@sha256:" | head -n1 || true)"
  if [ -z "$digest_ref" ]; then
    # A local image has no pullable registry digest. Keep the exact image
    # reference Compose used and separately record its content ID; fabricating
    # local-image:sha256:... would be rejected by Docker as an image reference.
    digest_ref="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)"
    [ -n "$digest_ref" ] || die "could not determine the running image reference for $container"
    docker image inspect "$digest_ref" >/dev/null 2>&1 || die "the local recovery image is unavailable: $digest_ref"
    echo "warning: container $container runs a local image; recording $digest_ref with content ID $image_id" >&2
  fi
  if [ -z "$captured" ]; then
    captured="$digest_ref"
    captured_id="$image_id"
  elif [ "$captured" != "$digest_ref" ]; then
    die "application roles run different images ($captured vs $digest_ref); refusing to upgrade"
  elif [ "$captured_id" != "$image_id" ]; then
    die "application roles run different image contents ($captured_id vs $image_id); refusing to upgrade"
  fi
done
[ "$captured_count" -ge 5 ] || die "could not capture all application roles (found $captured_count of 5); refusing to upgrade without a fixed rollback target"
say "current image: ${captured:-<none running>}"
say "candidate:     $target"
say "backup target: $backup"

if [ "$dry_run" -eq 1 ]; then
  say 'dry run: no writer stopped, no backup taken, no migration run'
  exit 0
fi

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

settings_backup="$backup_dir/deployment.env.$stamp"
cp -p "$settings" "$settings_backup"
settings_tmp="$(mktemp "$settings.XXXXXX")"
if ! sed "s|^CRMEB_IMAGE=.*|CRMEB_IMAGE=$target|" "$settings" > "$settings_tmp"; then
  rm -f "$settings_tmp"
  die 'could not prepare the candidate deployment settings'
fi
chmod 600 "$settings_tmp"
mv "$settings_tmp" "$settings"
printf 'candidate=%s\nprevious_image=%s\nprevious_image_id=%s\nsettings_backup=%s\n' "$target" "$captured" "$captured_id" "$settings_backup" > "$backup_dir/upgrade-$stamp.manifest"

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
      'exec mysqldump --no-tablespaces --single-transaction --routines --events --triggers --set-gtid-purged=OFF -u"${USERNAME:-root}" -p"${PASSWORD:-$MYSQL_ROOT_PASSWORD}" "${DATABASE:-$MYSQL_DATABASE}"' \
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

# 3. Restore the backup into an isolated database and compare retained rows.
if [ "${CRMEB_UPGRADE_SKIP_RESTORE_CHECK:-0}" != "1" ]; then
  say 'restoring the backup into an isolated database to verify it'
  check_container="crmeb-restore-check-$stamp"
  # --network none: the verification database can reach nothing.
  docker run -d --name "$check_container" --network none \
    -e MYSQL_ROOT_PASSWORD=restorecheck -e MYSQL_DATABASE=restorecheck \
    mysql:8.0.42 --default-authentication-plugin=mysql_native_password >/dev/null
  restore_failed=0
  restore_sql="$(mktemp)"
  # Wait for the *final* server, not merely for one that answers.
  #
  # MySQL's entrypoint initialises the data directory with a temporary server.
  # That server already has the configured root password, so "the password is
  # accepted" is NOT evidence that initialisation has finished -- the previous
  # version of this wait believed it was, and it is wrong. The temporary server
  # is then shut down and the real one is started, and a restore issued in that
  # gap dies with "Can't connect to local MySQL server through socket", which is
  # exactly how this check failed against production on 2026-09-21: the wait
  # returned, the temporary server went away, and the whole backup verification
  # was reported as an unusable backup.
  #
  # The two servers are distinguishable in the log: the temporary one reports
  # `port: 0` (it listens on a socket only), the real one reports `port: 3306`.
  # Require that line first, and only then a working connection.
  attempt=0
  until docker logs "$check_container" 2>&1 | grep -q 'ready for connections.*port: 3306' \
      && docker exec "$check_container" mysql -uroot -prestorecheck -e 'SELECT 1' >/dev/null 2>&1; do
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
  fi
  rm -f "$restore_sql"
  if [ "$restore_failed" -eq 0 ]; then
    # Count the retained business rows in both databases: the backup has to be
    # internally consistent, not merely non-empty.
    # The password is read inside each container from its own environment: the
    # host has no copy of it, which is the point of container-managed secrets.
    for table_pk in store_order:id store_order_cart_info:id store_order_refund:id store_coupon_user:id user:uid store_order_payment_attempt:id store_order_effect:id store_order_payment_exception:id; do
      table="$(printf '%s' "$table_pk" | cut -d: -f1)"
      pk="$(printf '%s' "$table_pk" | cut -d: -f2)"
      full_table="$db_prefix$table"
      # New reliability tables may be absent on both sides of a legacy backup.
      existence_sql="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='$full_table'"
      live_exists="$(compose exec -T "$mysql_service" sh -c \
        'mysql -u"${USERNAME:-root}" -p"${PASSWORD:-$MYSQL_ROOT_PASSWORD}" -N -B "${DATABASE:-$MYSQL_DATABASE}" -e "$1"' _ "$existence_sql" 2>/dev/null)" || { restore_failed=1; break; }
      restored_exists="$(docker exec "$check_container" sh -c \
        'mysql -u"${USERNAME:-root}" -p"${PASSWORD:-$MYSQL_ROOT_PASSWORD}" -N -B "${DATABASE:-$MYSQL_DATABASE}" -e "$1"' _ "$existence_sql" 2>/dev/null)" || { restore_failed=1; break; }
      if [ "$live_exists" = 0 ] && [ "$restored_exists" = 0 ]; then
        case "$table" in
          store_order_payment_attempt|store_order_effect|store_order_payment_exception) continue ;;
        esac
      fi
      if [ "$live_exists" != 1 ] || [ "$restored_exists" != 1 ]; then
        echo "retained-table mismatch or missing required table: $full_table" >&2
        restore_failed=1
        break
      fi
      # The password is read inside each container from its own environment: the
      # host never holds a copy of it.
      live="$(compose exec -T "$mysql_service" sh -c \
        'mysql -u"${USERNAME:-root}" -p"${PASSWORD:-$MYSQL_ROOT_PASSWORD}" -N -B "${DATABASE:-$MYSQL_DATABASE}" -e "SELECT COUNT(*) FROM $1"' _ "$full_table" \
        2>/dev/null || echo 'error')"
      restored="$(docker exec "$check_container" sh -c \
        'mysql -u"${USERNAME:-root}" -p"${PASSWORD:-$MYSQL_ROOT_PASSWORD}" -N -B "${DATABASE:-$MYSQL_DATABASE}" -e "SELECT COUNT(*) FROM $1"' _ "$full_table" \
        2>/dev/null || echo 'error')"
      live_hash="$(compose exec -T "$mysql_service" sh -c \
        'mysql -u"${USERNAME:-root}" -p"${PASSWORD:-$MYSQL_ROOT_PASSWORD}" --batch --raw --skip-column-names "${DATABASE:-$MYSQL_DATABASE}" -e "SELECT * FROM $1 ORDER BY $2"' _ "$full_table" "$pk" 2>/dev/null | sha256sum | awk '{print $1}' || echo 'error')"
      restored_hash="$(docker exec "$check_container" sh -c \
        'mysql -u"${USERNAME:-root}" -p"${PASSWORD:-$MYSQL_ROOT_PASSWORD}" --batch --raw --skip-column-names "${DATABASE:-$MYSQL_DATABASE}" -e "SELECT * FROM $1 ORDER BY $2"' _ "$full_table" "$pk" 2>/dev/null | sha256sum | awk '{print $1}' || echo 'error')"
      if [ "$live" != "$restored" ] || [ "$live_hash" != "$restored_hash" ] || [ "$live" = 'error' ] || [ "$(printf %s "$live_hash" | wc -c)" -ne 64 ] || [ "$(printf %s "$restored_hash" | wc -c)" -ne 64 ]; then
        restore_failed=1
        echo "retained-row mismatch for $full_table: live=$live/$live_hash restored=$restored/$restored_hash" >&2
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
    compose run --rm --no-deps -T --entrypoint php php upgrade/core-store/drop-retired.php plan \
      || die 'the migration pre-check could not run; nothing was migrated'
    retired_backup_dir="$backup_dir/retired-$stamp"
    mkdir -m 700 "$retired_backup_dir"
    retired_backup_dir="$(cd "$retired_backup_dir" && pwd)"
    printf 'retired_backup=%s/backup.json\n' "$retired_backup_dir" >> "$backup_dir/upgrade-$stamp.manifest"
    say "retired-feature backup: $retired_backup_dir/backup.json"
    compose run --rm --no-deps -T -v "$retired_backup_dir:/backups" --entrypoint php php upgrade/core-store/drop-retired.php apply /backups/backup.json \
      || die 'the retired-feature migration failed; restore from the backup before retrying'
    compose run --rm --no-deps -T --entrypoint php php upgrade/core-store/order-reliability.php apply \
      || die 'the reliability migration failed; restore from the backup before retrying'
    # `user.pwd` 历史上是 varchar(32)（正好装一个 MD5）。登录路径现在写 bcrypt，
    # 60 字符，列不加宽会被 MySQL 静默截断。登录侧有兜底（写完读回来验，验不过就
    # 写回原值），所以先后顺序不会锁死用户，但升级要真正发生就得跑这一步。
    compose run --rm --no-deps -T --entrypoint php php upgrade/core-store/user-password-hash.php apply \
      || die 'the password column migration failed; restore from the backup before retrying'
  fi
else
  say 'skipping the migrations as requested'
fi

# 5. Start the stack again and prove it became ready.
say 'starting the stack'
if ! compose up -d --wait --wait-timeout 300 >/dev/null; then
  compose stop $app_services >/dev/null 2>&1 || true
  die 'the stack did not become healthy; it stays in maintenance mode and the backup is intact'
fi

for service in php queue timer workerman nginx; do
  container="$(compose ps -q "$service" 2>/dev/null || true)"
  if [ -z "$container" ]; then
    compose stop $app_services >/dev/null 2>&1 || true
    die "missing application service: $service"
  fi
  actual="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)"
  if [ "$actual" != "$target" ]; then
    compose stop $app_services >/dev/null 2>&1 || true
    die "$service is using $actual instead of $target"
  fi
done

maintenance_mode=0
trap - EXIT
say "upgrade complete: $target"
say "rollback target: ${captured:-<none>}"
say "backup: $backup"
say "settings backup: $settings_backup"
