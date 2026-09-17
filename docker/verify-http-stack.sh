#!/usr/bin/env sh
set -eu

image="${1:?usage: docker/verify-http-stack.sh IMAGE}"
network="crmeb-http-check-$$"
php_container="crmeb-http-php-$$"
nginx_container="crmeb-http-nginx-$$"
fixture_dir="$(mktemp -d)"

cleanup() {
    docker rm -f "$nginx_container" "$php_container" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    rm -rf "$fixture_dir"
}
trap cleanup EXIT INT TERM

printf 'installed\n' > "$fixture_dir/.constant"

docker network create "$network" >/dev/null
docker run -d --name "$php_container" --network "$network" --network-alias php --network-alias workerman \
    -v "$(pwd)/docker/regression/test.env:/var/www/crmeb/.env:ro" \
    -v "$fixture_dir/.constant:/var/www/crmeb/.constant:ro" "$image" php >/dev/null
docker run -d --name "$nginx_container" --network "$network" \
    -p 127.0.0.1::80 \
    -v "$(pwd)/docker/regression/test.env:/var/www/crmeb/.env:ro" \
    "$image" nginx >/dev/null

port="$(docker port "$nginx_container" 80/tcp | sed 's/.*://')"
attempt=0
until curl --fail --silent "http://127.0.0.1:${port}/healthz" | grep -q '^ok$'; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        docker logs "$nginx_container" >&2
        exit 1
    fi
    sleep 1
done

docker exec "$nginx_container" nginx -t
curl --fail --silent --show-error "http://127.0.0.1:${port}/admin/index.html" | grep -q '<html'
curl --fail --silent --show-error "http://127.0.0.1:${port}/index.html" | grep -q '<html'
test "$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:${port}/readyz")" = 503
echo "HTTP stack verification passed: $image"
