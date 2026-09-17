#!/usr/bin/env bash
set -Eeuo pipefail

target="${1:?usage: rollback.sh ghcr.io/xiangyumou/crmeb@sha256:DIGEST|--edge}"
if [ "$target" = --edge ]; then
  target=ghcr.io/xiangyumou/crmeb:edge
else
  [[ "$target" =~ ^ghcr\.io/xiangyumou/crmeb@sha256:[a-f0-9]{64}$ ]] || { echo 'Expected full image digest' >&2; exit 2; }
fi
root="$(cd "$(dirname "$0")/../.." && pwd)"
settings="$root/deployment/deployment.env"
test -L "$root/.env" && test -f "$settings"
previous="$(sed -n 's/^CRMEB_IMAGE=//p' "$settings")"
docker pull "$target"
docker run --rm --entrypoint sh "$target" -ec 'test -s public/index.php && test -s public/admin/index.html && test -s public/index.html'
temporary="$(mktemp "$root/deployment/deployment.env.XXXXXX")"
trap 'unlink "$temporary" 2>/dev/null || true' EXIT
sed "s|^CRMEB_IMAGE=.*|CRMEB_IMAGE=$target|" "$settings" > "$temporary"
chmod 600 "$temporary"
cp -p "$temporary" "$settings"
host="$(sed -n 's/^CRMEB_HOST=//p' "$settings")"
if ! docker compose --project-directory "$root" -f "$root/compose.yaml" up -d --wait --wait-timeout 180 ||
   ! curl -fsS --max-time 15 "https://$host/readyz" -o /dev/null ||
   ! curl -fsS --max-time 15 "https://$host/admin/index.html" -o /dev/null; then
  sed "s|^CRMEB_IMAGE=.*|CRMEB_IMAGE=$previous|" "$settings" > "$temporary"
  cp -p "$temporary" "$settings"
  docker compose --project-directory "$root" -f "$root/compose.yaml" up -d --wait --wait-timeout 180 || echo 'Recovery requires manual attention' >&2
  exit 1
fi
echo "Application pinned to $target; use --edge to resume updates"
