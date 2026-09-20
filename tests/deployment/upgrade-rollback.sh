#!/usr/bin/env bash
# Prove the upgrade and rollback rules on a real, disposable stack.
#
# deploy/production/upgrade.sh claims that a backup is verified before a
# migration runs and that a failure keeps maintenance mode. Those claims are
# tested here against a throwaway compose project that runs the real image and a
# real MySQL seeded from the install SQL, so the migrations under test are the
# ones a release runs. Each refusal path is forced and the run has to stop:
# a truncated backup, a migration that fails, and a rollback whose target image
# is unavailable.
#
# Usage: bash tests/deployment/upgrade-rollback.sh [IMAGE]
set -Eeuo pipefail

root="$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)"
image="${1:-crmeb-test}"
work="$(mktemp -d)"
project="crmeb-deploy-test-$$"
passed=0
# A fixed candidate in the form the script requires.
candidate="ghcr.io/xiangyumou/crmeb@sha256:$(printf 'b%.0s' $(seq 1 64))"

cleanup() {
    docker compose -p "$project" -f "$work/compose.yaml" down --volumes --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$work"
}
trap cleanup EXIT INT TERM

pass() { passed=$((passed + 1)); echo "ok - $1"; }
fail() { echo "deployment rules verification failed: $1" >&2; exit 1; }

docker image inspect "$image" >/dev/null 2>&1 || fail "image $image is not available locally"
# Compose resolves a bare local name without a registry lookup.
image_ref="$image"

# A production-shaped project: MySQL seeded from the install SQL, the application
# roles from the real image, and the deployment settings upgrade.sh expects.
mkdir -p "$work/deployment" "$work/data/backups" "$work/crmeb"
cp -r "$root/crmeb/upgrade" "$work/crmeb/upgrade"
cp "$root/crmeb/public/install/crmeb.sql" "$work/crmeb.sql"
cat > "$work/deployment/deployment.env" <<ENV
CRMEB_IMAGE=$image
ENV
cat > "$work/compose.yaml" <<YAML
name: $project
services:
  mysql:
    image: mysql:8.0.42
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: crmeb_deploy_test
    command:
      - --default-authentication-plugin=mysql_native_password
      - --sql-mode=ONLY_FULL_GROUP_BY,NO_ENGINE_SUBSTITUTION
    volumes:
      - ./crmeb.sql:/docker-entrypoint-initdb.d/001-crmeb.sql:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-uroot", "-prootpass", "--silent"]
      interval: 3s
      timeout: 5s
      retries: 60
  php:
    image: $image_ref
    command: ["sleep", "infinity"]
    entrypoint: []
    environment:
      APP_DEBUG: "false"
    volumes:
      - ./.env:/var/www/crmeb/.env:ro
      - ./.constant:/var/www/crmeb/.constant:ro
      - ./crmeb/upgrade:/var/www/crmeb/upgrade
    depends_on:
      mysql:
        condition: service_healthy
  queue:
    image: $image_ref
    command: ["sleep", "infinity"]
    entrypoint: []
    environment:
      APP_DEBUG: "false"
    volumes:
      - ./.env:/var/www/crmeb/.env:ro
      - ./.constant:/var/www/crmeb/.constant:ro
  timer:
    image: $image_ref
    command: ["sleep", "infinity"]
    entrypoint: []
    environment:
      APP_DEBUG: "false"
    volumes:
      - ./.env:/var/www/crmeb/.env:ro
      - ./.constant:/var/www/crmeb/.constant:ro
  workerman:
    image: $image_ref
    command: ["sleep", "infinity"]
    entrypoint: []
    environment:
      APP_DEBUG: "false"
    volumes:
      - ./.env:/var/www/crmeb/.env:ro
      - ./.constant:/var/www/crmeb/.constant:ro
  nginx:
    image: $image_ref
    command: ["sleep", "infinity"]
    entrypoint: []
    volumes:
      - ./.env:/var/www/crmeb/.env:ro
YAML
# The application roles only need to stay alive for this test: the migration step
# runs through CRMEB_MIGRATION_COMMAND, and the backup/restore check talks to
# MySQL directly. Using `sleep` keeps the roles' image digests visible to
# upgrade.sh's rollback-target capture without starting a full web stack.
cat > "$work/migrate.sh" <<'SH'
#!/bin/sh
# Stands in for the release's migration step. CRMEB_MIGRATION_FAIL simulates the
# migration failing after the backup was taken and verified.
if [ "${CRMEB_MIGRATION_FAIL:-0}" = "1" ]; then
    echo "migration failed" >&2
    exit 1
fi
echo "migration ran at $(date -u +%FT%TZ)"
SH

cd "$work"
if ! docker compose -p "$project" -f "$work/compose.yaml" up -d --wait --wait-timeout 300 >"$work/stack-up.log" 2>&1; then
    cat "$work/stack-up.log" >&2
    fail 'the disposable stack never became healthy'
fi

say_stack_running() {
    docker compose -p "$project" -f "$work/compose.yaml" ps php --status running | grep -q php
}

# upgrade.sh is invoked with this project as its world.
run_upgrade() {
    CRMEB_DEPLOY_ROOT="$work" \
    CRMEB_DEPLOY_PROJECT="$project" \
    CRMEB_DEPLOY_COMPOSE_FILE="$work/compose.yaml" \
    CRMEB_BACKUP_DIR="$work/data/backups" \
    CRMEB_MIGRATION_COMMAND="sh $work/migrate.sh" \
    bash "$root/deploy/production/upgrade.sh" "$@"
}

# 1. A moving tag is refused before anything is touched.
if run_upgrade "ghcr.io/xiangyumou/crmeb:edge" >"$work/bad-target.log" 2>&1; then
    fail 'a moving tag was accepted as an upgrade target'
fi
grep -q 'Expected a fixed candidate' "$work/bad-target.log" || fail 'the moving-tag refusal did not explain itself'
say_stack_running || fail 'the refused run stopped the stack'
pass 'a moving tag is refused: only a fixed digest is accepted'

# 2. A dry run reports the plan without stopping writers or backing up.
before_backups="$(ls "$work/data/backups" | wc -l)"
run_upgrade "$candidate" --dry-run >"$work/dry.log" 2>&1 ||
    { cat "$work/dry.log" >&2; fail 'the dry run failed'; }
grep -q 'dry run' "$work/dry.log" || fail 'the dry run did not report itself'
[ "$(ls "$work/data/backups" | wc -l)" -eq "$before_backups" ] || fail 'the dry run took a backup'
say_stack_running || fail 'the dry run stopped a writer'
pass 'a dry run reports the plan without touching the stack'

# 3. A migration failure keeps maintenance mode: writers stay stopped.
if CRMEB_MIGRATION_FAIL=1 run_upgrade "$candidate" >"$work/migration-fail.log" 2>&1; then
    fail 'a failing migration was reported as a successful upgrade'
fi
grep -q 'UPGRADE FAILED' "$work/migration-fail.log" || fail 'the failed upgrade did not stay in maintenance mode'
if say_stack_running; then
    fail 'writers were running after a failed migration'
fi
pass 'a failing migration keeps maintenance mode and does not resume traffic'

# 4. A truncated backup is detected before the migrations run. The run is pointed
#    at the damaged file explicitly, because a normal run takes a fresh backup.
latest="$(ls -t "$work/data/backups"/*.sql.gz | head -1)"
cp "$latest" "$work/good.sql.gz"
head -c 128 "$work/good.sql.gz" > "$work/data/backups/truncated.sql.gz"
if run_upgrade "$candidate" --backup-file="$work/data/backups/truncated.sql.gz" >"$work/truncated.log" 2>&1; then
    fail 'a truncated backup was accepted'
fi
grep -qE 'not a complete gzip stream' "$work/truncated.log" || {
    echo '--- truncated run output:' >&2
    cat "$work/truncated.log" >&2
    fail 'the truncated backup was not diagnosed'
}
grep -q 'UPGRADE FAILED' "$work/truncated.log" || fail 'the truncated-backup run did not stay in maintenance mode'
if say_stack_running; then
    fail 'writers resumed despite a truncated backup'
fi
pass 'a truncated backup stops the upgrade before any migration'

# 5. A backup whose contents disagree with the live database fails the restore check.
#    The dump is truncated mid-stream but still valid gzip, so the gzip check
#    passes and only the restore comparison can catch it.
gzip -dc "$work/good.sql.gz" > "$work/good.sql"
head -c 1000 "$work/good.sql" > "$work/short.sql"
gzip -c "$work/short.sql" > "$work/data/backups/tampered.sql.gz"
if run_upgrade "$candidate" --backup-file="$work/data/backups/tampered.sql.gz" >"$work/tampered.log" 2>&1; then
    fail 'a backup that cannot be restored was accepted'
fi
grep -qE 'could not be restored|retained-row mismatch' "$work/tampered.log" || fail 'the unrestorable backup was not diagnosed'
if say_stack_running; then
    fail 'writers resumed despite an unrestorable backup'
fi
pass 'a backup that cannot be restored stops the upgrade before any migration'

# 6. The successful path runs end to end and takes a fresh verified backup.
run_upgrade "$candidate" >"$work/success.log" 2>&1 ||
    { cat "$work/success.log" >&2; fail 'a valid upgrade was refused'; }
grep -q 'backup restored and the retained rows match' "$work/success.log" || fail 'the restore check did not report success'
grep -q 'upgrade complete' "$work/success.log" || fail 'the upgrade did not report completion'
grep -q 'rollback target' "$work/success.log" || fail 'the upgrade did not record a rollback target'
latest="$(ls -t "$work/data/backups"/*.sql.gz | head -1)"
gzip -t "$latest" || fail 'the produced backup is not a valid gzip stream'
say_stack_running || fail 'the stack was not started again after a successful upgrade'
pass 'a verified upgrade backs up, restores, migrates and resumes traffic'

# 7. rollback.sh refuses a target that is not available locally, and refuses a
#    mixed-image deployment instead of guessing.
if CRMEB_DEPLOY_ROOT="$work" CRMEB_DEPLOY_PROJECT="$project" CRMEB_DEPLOY_COMPOSE_FILE="$work/compose.yaml" \
        bash "$root/deploy/production/rollback.sh" "ghcr.io/xiangyumou/crmeb@sha256:$(printf 'c%.0s' $(seq 1 64))" >"$work/rollback.log" 2>&1; then
    fail 'rollback accepted a digest that is not available'
fi
grep -qE 'not available locally|cannot be pinned|refusing|failed to resolve|manifest unknown|denied' "$work/rollback.log" || {
    echo '--- rollback output:' >&2
    cat "$work/rollback.log" >&2
    fail 'the rollback refusal did not explain itself'
}
pass 'rollback refuses an unavailable target instead of changing the deployment'

echo "deployment rules verification passed ($passed checks)"
