#!/usr/bin/env bash
# Pin the production stack to a fixed image, or resume tracking the tested
# `edge` release. Replacing containers never changes database contents; a
# database rollback is a separate, verified recovery procedure.
set -Eeuo pipefail

repo="${CRMEB_IMAGE_REPOSITORY:-ghcr.io/xiangyumou/crmeb}"
requested_target="${1:---last-upgrade}"

# A deployment may be rooted elsewhere (and a rehearsal must be able to run
# against a disposable copy), so the root, compose file and project name are
# overridable the same way upgrade.sh allows.
root="$(cd "$(dirname "$0")/../.." && pwd)"
deploy_root="${CRMEB_DEPLOY_ROOT:-$root}"
settings="$deploy_root/deployment/deployment.env"
backup_dir="${CRMEB_BACKUP_DIR:-$deploy_root/data/backups}"
compose_file="${CRMEB_DEPLOY_COMPOSE_FILE:-$deploy_root/compose.yaml}"
test -f "$settings" || { echo "The deployment settings are missing: $settings" >&2; exit 2; }
grep -q '^CRMEB_IMAGE=' "$settings" || { echo "CRMEB_IMAGE is missing from the deployment settings." >&2; exit 2; }
manifest=''
restore_settings=''
expected_target_id=''
if [ "$requested_target" = --last-upgrade ]; then
  manifest="$(ls -t "$backup_dir"/upgrade-*.manifest 2>/dev/null | head -n1 || true)"
  [ -n "$manifest" ] || { echo "No upgrade manifest was found in $backup_dir" >&2; exit 2; }
  target="$(sed -n 's/^previous_image=//p' "$manifest")"
  restore_settings="$(sed -n 's/^settings_backup=//p' "$manifest")"
  expected_target_id="$(sed -n 's/^previous_image_id=//p' "$manifest")"
  [ -n "$target" ] && [ -n "$restore_settings" ] || {
    echo "The upgrade manifest is incomplete: $manifest" >&2
    exit 2
  }
else
  target="$requested_target"
  if [ "$target" = --edge ]; then
    target="$repo:edge"
  else
    [[ "$target" =~ ^[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64}$ ]] || {
      echo "Expected a full image digest: ${repo}@sha256:<64 hex>" >&2
      exit 2
    }
  fi
fi
if [ -z "$manifest" ]; then
  case "$target" in
    "$repo"@sha256:*) ;;
    *) echo "Rollback repository does not match CRMEB_IMAGE_REPOSITORY ($repo): $target" >&2; exit 2 ;;
  esac
fi
if [ -n "${CRMEB_DEPLOY_PROJECT:-}" ]; then
  compose() { docker compose -p "$CRMEB_DEPLOY_PROJECT" --project-directory "$deploy_root" -f "$compose_file" --env-file "$settings" "$@"; }
else
  compose() { docker compose --project-directory "$deploy_root" -f "$compose_file" --env-file "$settings" "$@"; }
fi
[ -n "${CRMEB_DEPLOY_ROOT:-}" ] || { test -L "$root/.env" && test -f "$settings"; }

# Capture the immutable digest of the image the application roles are running
# now, before anything is pulled. `edge` moves, so restoring the tag string
# later would start whatever `edge` points to then; a digest cannot drift.
app_services="php queue timer workerman nginx"
captured=''
captured_id=''
captured_count=0
for container in $(compose ps -q $app_services 2>/dev/null || true); do
  [ -n "$container" ] || continue
  image_id="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"
  [ -n "$image_id" ] || continue
  captured_count=$((captured_count + 1))
  digest_ref="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" 2>/dev/null | grep -F "${repo}@sha256:" | head -n1 || true)"
  if [ -z "$digest_ref" ]; then
    # A locally built image has no registry digest. Keep the exact valid image
    # reference Compose used and record its real image ID separately.
    digest_ref="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)"
    [ -n "$digest_ref" ] || { echo "Could not determine the image reference for $container." >&2; exit 3; }
    docker image inspect "$digest_ref" >/dev/null 2>&1 || { echo "The local recovery image $digest_ref is unavailable." >&2; exit 3; }
    echo "Warning: container $container has no registry digest; recording $digest_ref with content ID $image_id." >&2
  fi
  if [ -z "$captured" ]; then
    captured="$digest_ref"
    captured_id="$image_id"
  elif [ "$captured" != "$digest_ref" ]; then
    echo "Application roles are running different images ($captured vs $digest_ref); refusing to guess a recovery target." >&2
    exit 3
  elif [ "$captured_id" != "$image_id" ]; then
    echo "Application roles are running different image contents; refusing to guess a recovery target." >&2
    exit 3
  fi
done

[ "$captured_count" -ge 5 ] || [ -n "$manifest" ] || {
  echo "Could not capture all application roles (found $captured_count of 5); refusing to guess a recovery target." >&2
  exit 3
}

if [ -n "$captured" ]; then
  # The recovery target has to exist before the deployment setting is touched.
  docker image inspect "$captured" >/dev/null 2>&1 || {
    echo "The running image digest $captured is not available locally; refusing to change the deployment." >&2
    exit 3
  }
  if ! docker manifest inspect "$captured" >/dev/null 2>&1; then
    echo "Warning: the registry did not confirm $captured (auth or network); its local copy is still usable for recovery." >&2
  fi
else
  echo 'No application container is running; a previous image cannot be captured.' >&2
fi

if ! docker image inspect "$target" >/dev/null 2>&1; then
  docker pull "$target"
fi
target_id="$(docker image inspect --format '{{.Id}}' "$target" 2>/dev/null || true)"
[ -n "$target_id" ] || { echo "The rollback target is not available locally: $target" >&2; exit 3; }
if [ -n "$expected_target_id" ] && [ "$target_id" != "$expected_target_id" ]; then
  echo "The manifest expected image $expected_target_id for $target, but local content is $target_id" >&2
  exit 3
fi
docker run --rm --entrypoint sh "$target" -ec 'test -s public/index.php && test -s public/admin/index.html && test -s public/index.html' || {
  echo "The image $target is missing required release artifacts; nothing was changed." >&2
  exit 3
}

temporary="$(mktemp "$settings.XXXXXX")"
trap 'rm -f "$temporary"' EXIT

pin() {
  sed "s|^CRMEB_IMAGE=.*|CRMEB_IMAGE=$1|" "$settings" > "$temporary"
  chmod 600 "$temporary"
  cp -p "$temporary" "$settings"
}

if [ -n "$restore_settings" ]; then
  test -f "$restore_settings" || { echo "The settings backup is missing: $restore_settings" >&2; exit 3; }
  cp -p "$restore_settings" "$settings"
else
  pin "$target"
fi
host="$(sed -n 's/^CRMEB_HOST=//p' "$settings")"
health_base="${CRMEB_ROLLBACK_HEALTH_BASE:-https://$host}"

recover() {
  echo 'The new containers did not pass their checks.' >&2
  if [ -z "$captured" ]; then
    echo "No captured digest; $settings still names $target. Pin the intended image by hand." >&2
    return 1
  fi
  docker image inspect "$captured" >/dev/null 2>&1 || {
    echo "The previously running image reference $captured is no longer available locally." >&2
    return 1
  }
  echo "Restoring the previously running image $captured (content $captured_id)" >&2
  if [ -n "$restore_settings" ] && [ -f "$restore_settings" ]; then
    cp -p "$restore_settings" "$settings"
  else
    pin "$captured"
  fi
  compose up -d --wait --wait-timeout 180 || {
    echo 'The previous image did not become healthy either; manual attention is required.' >&2
    return 1
  }
}

verify_roles() {
  for service in $app_services; do
    container="$(compose ps -q "$service" 2>/dev/null || true)"
    [ -n "$container" ] || return 1
    actual_ref="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)"
    actual_id="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"
    [ "$actual_ref" = "$target" ] && [ "$actual_id" = "$target_id" ] || return 1
  done
}

if ! compose up -d --wait --wait-timeout 180 ||
   ! verify_roles ||
   ! curl -fsS --max-time 15 "$health_base/readyz" -o /dev/null ||
   ! curl -fsS --max-time 15 "$health_base/admin/index.html" -o /dev/null; then
  recover || true
  exit 1
fi

echo "Application pinned to $target; use --edge to resume updates."
echo 'Database contents were not changed by this script.'
