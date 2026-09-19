#!/usr/bin/env bash
# Pin the production stack to a fixed image, or resume tracking the tested
# `edge` release. Replacing containers never changes database contents; a
# database rollback is a separate, verified recovery procedure.
set -Eeuo pipefail

repo=ghcr.io/xiangyumou/crmeb
target="${1:?usage: rollback.sh ghcr.io/xiangyumou/crmeb@sha256:DIGEST|--edge}"
if [ "$target" = --edge ]; then
  target="$repo:edge"
else
  [[ "$target" =~ ^ghcr\.io/xiangyumou/crmeb@sha256:[a-f0-9]{64}$ ]] || {
    echo 'Expected a full image digest: ghcr.io/xiangyumou/crmeb@sha256:<64 hex>' >&2
    exit 2
  }
fi

root="$(cd "$(dirname "$0")/../.." && pwd)"
settings="$root/deployment/deployment.env"
compose_file="$root/compose.yaml"
test -L "$root/.env" && test -f "$settings"

compose() { docker compose --project-directory "$root" -f "$compose_file" "$@"; }

# Capture the immutable digest of the image the application roles are running
# now, before anything is pulled. `edge` moves, so restoring the tag string
# later would start whatever `edge` points to then; a digest cannot drift.
app_services="php queue timer workerman nginx"
captured=''
for container in $(compose ps -q $app_services 2>/dev/null || true); do
  [ -n "$container" ] || continue
  image_id="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"
  [ -n "$image_id" ] || continue
  digest_ref="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" 2>/dev/null | grep "^${repo}@sha256:" | head -n1 || true)"
  if [ -z "$digest_ref" ]; then
    echo "The image behind container $container has no recorded $repo digest; cannot pin a recovery target." >&2
    exit 3
  fi
  if [ -z "$captured" ]; then
    captured="$digest_ref"
  elif [ "$captured" != "$digest_ref" ]; then
    echo "Application roles are running different images ($captured vs $digest_ref); refusing to guess a recovery target." >&2
    exit 3
  fi
done

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

docker pull "$target"
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

pin "$target"
host="$(sed -n 's/^CRMEB_HOST=//p' "$settings")"

recover() {
  echo 'The new containers did not pass their checks.' >&2
  if [ -z "$captured" ]; then
    echo "No captured digest; $settings still names $target. Pin the intended image by hand." >&2
    return 1
  fi
  echo "Restoring the previously running image $captured" >&2
  pin "$captured"
  compose up -d --wait --wait-timeout 180 || {
    echo 'The previous image did not become healthy either; manual attention is required.' >&2
    return 1
  }
}

if ! compose up -d --wait --wait-timeout 180 ||
   ! curl -fsS --max-time 15 "https://$host/readyz" -o /dev/null ||
   ! curl -fsS --max-time 15 "https://$host/admin/index.html" -o /dev/null; then
  recover || true
  exit 1
fi

echo "Application pinned to $target; use --edge to resume updates."
echo 'Database contents were not changed by this script.'
