#!/usr/bin/env sh
set -eu

root_dir="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
test_dir="$root_dir/tests/regression"
compose_file="$root_dir/docker/regression/compose.yml"
CRMEB_TEST_REVISION="$(git -C "$root_dir" rev-parse HEAD)"
export CRMEB_TEST_REVISION
export CRMEB_TEST_IMAGE="${1:?usage: docker/run-regression.sh TESTED_IMAGE}"
test "$(docker image inspect "$CRMEB_TEST_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$CRMEB_TEST_REVISION"

mkdir -p "$test_dir/artifacts"
rm -f "$test_dir/artifacts/junit.xml"

if [ ! -x "$test_dir/vendor/bin/phpunit" ]; then
    docker run --rm \
        -v "$test_dir:/app" \
        -w /app \
        composer:2.2.30 install --no-interaction --no-progress --prefer-dist
fi

cleanup() {
    docker compose -f "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cleanup

# Docker copies the image content into an empty named volume while the container
# starts. php-fpm and workerman both mount the runtime and uploads volumes and
# Compose starts them in parallel, so the two copies race inside one volume and
# the stack dies with "failed to mkdir .../temp: file exists". Populate the
# shared volumes once, serially, before any container that mounts them starts.
project="$(awk '/^name:/{print $2; exit}' "$compose_file")"
for volume in runtime uploads; do
    docker volume create "${project}_${volume}" >/dev/null
done
docker run --rm --entrypoint sh \
    -v "${project}_runtime:/var/www/crmeb/runtime" \
    -v "${project}_uploads:/var/www/crmeb/public/uploads" \
    "$CRMEB_TEST_IMAGE" -c 'test -d /var/www/crmeb/runtime/temp'

set +e
docker compose -f "$compose_file" up --build --abort-on-container-exit --exit-code-from regression regression
status=$?
set -e

if [ ! -s "$test_dir/artifacts/junit.xml" ]; then
    printf '%s\n' \
        '<?xml version="1.0" encoding="UTF-8"?>' \
        '<testsuites tests="1" failures="1">' \
        '  <testsuite name="regression-bootstrap" tests="1" failures="1">' \
        '    <testcase name="docker-compose"><failure message="Regression containers failed before PHPUnit produced a report"/></testcase>' \
        '  </testsuite>' \
        '</testsuites>' > "$test_dir/artifacts/junit.xml"
fi

exit "$status"
