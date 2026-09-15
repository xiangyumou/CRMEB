#!/usr/bin/env sh
set -eu

root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
test_dir="$root_dir/tests/regression"
compose_file="$root_dir/docker/regression/compose.yml"

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
