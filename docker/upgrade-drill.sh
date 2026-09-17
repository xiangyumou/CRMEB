#!/usr/bin/env bash
set -Eeuo pipefail

image_a="${1:?usage: docker/upgrade-drill.sh IMAGE_A IMAGE_B}"
image_b="${2:?usage: docker/upgrade-drill.sh IMAGE_A IMAGE_B}"
root="$(cd "$(dirname "$0")/.." && pwd)"
compose="$root/docker/regression/compose.yml"
CRMEB_TEST_REVISION="$(git -C "$root" rev-parse HEAD)"
export CRMEB_TEST_REVISION
export CRMEB_TEST_IMAGE="$image_a"

test "$(docker image inspect "$image_a" --format '{{.Id}}')" != "$(docker image inspect "$image_b" --format '{{.Id}}')" || {
  echo 'A and B must be different local images' >&2
  exit 1
}
test -z "$(docker compose -f "$compose" ps -q)" || {
  echo 'The isolated regression stack is already in use' >&2
  exit 1
}
cleanup() { docker compose -f "$compose" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

start() {
  CRMEB_TEST_IMAGE="$1" docker compose -f "$compose" up -d --no-build --pull never --wait --wait-timeout 180 mysql redis php-fpm nginx
  docker compose -f "$compose" exec -T nginx curl -fsS http://127.0.0.1/readyz | grep -q '"ready":true'
  docker compose -f "$compose" exec -T nginx curl -fsS http://127.0.0.1/pages/index/index | grep -q '<html'
  test "$(docker inspect "$(docker compose -f "$compose" ps -q php-fpm)" -f '{{.Image}}')" = "$(docker image inspect "$1" -f '{{.Id}}')"
  test "$(docker inspect "$(docker compose -f "$compose" ps -q nginx)" -f '{{.Image}}')" = "$(docker image inspect "$1" -f '{{.Id}}')"
}

start "$image_a"
mysql_id="$(docker compose -f "$compose" ps -q mysql)"
redis_id="$(docker compose -f "$compose" ps -q redis)"
docker compose -f "$compose" exec -T php-fpm sh -ec 'printf retained > public/uploads/upgrade-drill.txt; printf retained > runtime/session/upgrade-drill.txt'
docker compose -f "$compose" exec -T redis redis-cli SET upgrade-drill retained | grep -qx OK
old_asset="$(docker run --rm --entrypoint sh "$image_a" -c 'find public/static/js -type f -name "*.*.js" | head -n 1' | sed 's|^public||')"
test -n "$old_asset"

for image in "$image_b" "$image_a"; do
  export CRMEB_TEST_IMAGE="$image"
  start "$image"
  test "$(docker compose -f "$compose" ps -q mysql)" = "$mysql_id"
  test "$(docker compose -f "$compose" ps -q redis)" = "$redis_id"
  docker compose -f "$compose" exec -T php-fpm sh -ec 'test "$(cat public/uploads/upgrade-drill.txt)" = retained && test "$(cat runtime/session/upgrade-drill.txt)" = retained'
  docker compose -f "$compose" exec -T redis redis-cli GET upgrade-drill | grep -qx retained
  docker compose -f "$compose" exec -T nginx test -s "/var/cache/crmeb/assets$old_asset"
  docker compose -f "$compose" exec -T nginx curl -fsS "http://127.0.0.1$old_asset" -o /dev/null
done
echo 'A -> B -> A upgrade drill passed; data containers and persistent files survived'
