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
registry_container="crmeb-deploy-registry-$$"
passed=0
candidate_image="crmeb-deploy-candidate-$$"
registry_port=''
registry_repo=''
candidate=''
health_pid=''

cleanup() {
    docker compose -p "$project" --env-file "$work/deployment/deployment.env" -f "$work/compose.yaml" down --volumes --remove-orphans >/dev/null 2>&1 || true
    docker rm -f "$registry_container" >/dev/null 2>&1 || true
    [ -z "$health_pid" ] || kill "$health_pid" >/dev/null 2>&1 || true
    docker rmi "$candidate_image" >/dev/null 2>&1 || true
    rm -rf "$work"
}
trap cleanup EXIT INT TERM

pass() { passed=$((passed + 1)); echo "ok - $1"; }
fail() { echo "deployment rules verification failed: $1" >&2; exit 1; }

docker image inspect "$image" >/dev/null 2>&1 || fail "image $image is not available locally"
# Build a second real local image with a distinct config digest, then publish it
# to a throwaway registry. The upgrade must pull and run this image by digest;
# a fabricated digest would make the test stop before any migration.
candidate_container="$(docker create "$image")"
docker commit --change "LABEL crmeb.deployment-test=candidate-$$" "$candidate_container" "$candidate_image" >/dev/null
docker rm "$candidate_container" >/dev/null
docker run -d --name "$registry_container" -p 127.0.0.1::5000 registry:2 >/dev/null
registry_port="$(docker port "$registry_container" 5000/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')"
[ -n "$registry_port" ] || fail 'the disposable registry did not publish a port'
registry_repo="127.0.0.1:$registry_port/crmeb"
docker tag "$candidate_image" "$registry_repo:candidate"
docker push "$registry_repo:candidate" >/dev/null
candidate="$(docker image inspect --format '{{index .RepoDigests 0}}' "$registry_repo:candidate")"
case "$candidate" in
    "$registry_repo"@sha256:*) ;;
    *) fail "the candidate did not resolve to a registry digest: $candidate" ;;
esac
# Compose resolves the old image locally; its service image is parameterized so
# upgrade.sh's settings change actually selects the candidate on restart.
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
    image: \${CRMEB_IMAGE}
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
    image: \${CRMEB_IMAGE}
    command: ["sleep", "infinity"]
    entrypoint: []
    environment:
      APP_DEBUG: "false"
    volumes:
      - ./.env:/var/www/crmeb/.env:ro
      - ./.constant:/var/www/crmeb/.constant:ro
  timer:
    image: \${CRMEB_IMAGE}
    command: ["sleep", "infinity"]
    entrypoint: []
    environment:
      APP_DEBUG: "false"
    volumes:
      - ./.env:/var/www/crmeb/.env:ro
      - ./.constant:/var/www/crmeb/.constant:ro
  workerman:
    image: \${CRMEB_IMAGE}
    command: ["sleep", "infinity"]
    entrypoint: []
    environment:
      APP_DEBUG: "false"
    volumes:
      - ./.env:/var/www/crmeb/.env:ro
      - ./.constant:/var/www/crmeb/.constant:ro
  nginx:
    image: \${CRMEB_IMAGE}
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
if ! docker compose -p "$project" --env-file "$work/deployment/deployment.env" -f "$work/compose.yaml" up -d --wait --wait-timeout 300 >"$work/stack-up.log" 2>&1; then
    cat "$work/stack-up.log" >&2
    fail 'the disposable stack never became healthy'
fi
old_container="$(docker compose -p "$project" --env-file "$work/deployment/deployment.env" -f "$work/compose.yaml" ps -q php)"
old_image_id="$(docker inspect --format '{{.Image}}' "$old_container")"

say_stack_running() {
    docker compose -p "$project" --env-file "$work/deployment/deployment.env" -f "$work/compose.yaml" ps php --status running | grep -q php
}

start_stack() {
    docker compose -p "$project" --env-file "$work/deployment/deployment.env" -f "$work/compose.yaml" up -d --wait --wait-timeout 300 >/dev/null
}

reset_old_stack() {
    sed -i "s|^CRMEB_IMAGE=.*|CRMEB_IMAGE=$image|" "$work/deployment/deployment.env"
    start_stack
}

# upgrade.sh is invoked with this project as its world.
run_upgrade() {
    CRMEB_DEPLOY_ROOT="$work" \
    CRMEB_DEPLOY_PROJECT="$project" \
    CRMEB_DEPLOY_COMPOSE_FILE="$work/compose.yaml" \
    CRMEB_IMAGE_REPOSITORY="$registry_repo" \
    CRMEB_BACKUP_DIR="$work/data/backups" \
    CRMEB_MIGRATION_COMMAND="sh $work/migrate.sh" \
    bash "$root/deploy/production/upgrade.sh" "$@"
}

# 1. A moving tag is refused before anything is touched.
if run_upgrade "$registry_repo:edge" >"$work/bad-target.log" 2>&1; then
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
reset_old_stack || fail 'could not reset the disposable stack before the truncated-backup case'
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
reset_old_stack || fail 'could not reset the disposable stack before the tampered-backup case'
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
reset_old_stack || fail 'could not reset the disposable stack before the successful upgrade case'
run_upgrade "$candidate" >"$work/success.log" 2>&1 ||
    { cat "$work/success.log" >&2; fail 'a valid upgrade was refused'; }
grep -q 'backup restored and the retained rows match' "$work/success.log" || fail 'the restore check did not report success'
grep -q 'upgrade complete' "$work/success.log" || fail 'the upgrade did not report completion'
grep -q 'rollback target' "$work/success.log" || fail 'the upgrade did not record a rollback target'
latest="$(ls -t "$work/data/backups"/*.sql.gz | head -1)"
gzip -t "$latest" || fail 'the produced backup is not a valid gzip stream'
say_stack_running || fail 'the stack was not started again after a successful upgrade'
pass 'a verified upgrade backs up, restores, migrates and resumes traffic'

# 7. The persistent manifest is sufficient for a recovery even after the
# deployment settings already point at the candidate. A tiny host HTTP server
# supplies the two liveness URLs because this disposable stack intentionally
# runs sleep as its application command.
health_dir="$work/health"
mkdir -p "$health_dir/admin"
touch "$health_dir/readyz" "$health_dir/admin/index.html"
health_port="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
)"
python3 -m http.server "$health_port" --directory "$health_dir" >"$work/health.log" 2>&1 &
health_pid=$!
until curl -fsS "http://127.0.0.1:$health_port/readyz" >/dev/null 2>&1; do sleep 1; done
if ! CRMEB_DEPLOY_ROOT="$work" CRMEB_DEPLOY_PROJECT="$project" CRMEB_DEPLOY_COMPOSE_FILE="$work/compose.yaml" \
        CRMEB_IMAGE_REPOSITORY="$registry_repo" \
        CRMEB_ROLLBACK_HEALTH_BASE="http://127.0.0.1:$health_port" \
        bash "$root/deploy/production/rollback.sh" --last-upgrade >"$work/manifest-rollback.log" 2>&1; then
    cat "$work/manifest-rollback.log" >&2
    cat "$work/data/backups"/upgrade-*.manifest >&2 || true
    fail 'rollback could not use the persistent upgrade manifest'
fi
new_container="$(docker compose -p "$project" --env-file "$work/deployment/deployment.env" -f "$work/compose.yaml" ps -q php)"
[ "$(docker inspect --format '{{.Image}}' "$new_container")" = "$old_image_id" ] || fail 'manifest rollback did not restore the previous image content'
grep -qx "CRMEB_IMAGE=$image" "$work/deployment/deployment.env" || fail 'manifest rollback did not restore deployment settings'
pass 'rollback restores the fixed image and settings recorded by the upgrade manifest'

# 8. rollback.sh refuses a target that is not available locally, and refuses a
#    mixed-image deployment instead of guessing.
if CRMEB_DEPLOY_ROOT="$work" CRMEB_DEPLOY_PROJECT="$project" CRMEB_DEPLOY_COMPOSE_FILE="$work/compose.yaml" \
        CRMEB_IMAGE_REPOSITORY="$registry_repo" \
        bash "$root/deploy/production/rollback.sh" "$registry_repo@sha256:$(printf 'c%.0s' $(seq 1 64))" >"$work/rollback.log" 2>&1; then
    fail 'rollback accepted a digest that is not available'
fi
grep -qE 'not available locally|cannot be pinned|refusing|failed to resolve|manifest unknown|denied' "$work/rollback.log" || {
    echo '--- rollback output:' >&2
    cat "$work/rollback.log" >&2
    fail 'the rollback refusal did not explain itself'
}
pass 'rollback refuses an unavailable target instead of changing the deployment'

echo "deployment rules verification passed ($passed checks)"
