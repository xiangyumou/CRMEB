#!/usr/bin/env sh
set -eu

image="${1:?usage: docker/verify-http-stack.sh IMAGE}"
network="crmeb-http-check-$$"
php_container="crmeb-http-php-$$"
nginx_container="crmeb-http-nginx-$$"
public_dir="$(mktemp -d)"
source_container=""

cleanup() {
    docker rm -f "$nginx_container" "$php_container" "$source_container" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    rm -rf "$public_dir"
}
trap cleanup EXIT INT TERM

source_container="$(docker create "$image")"
docker cp "$source_container:/var/www/crmeb/public/." "$public_dir/"
docker rm "$source_container" >/dev/null
source_container=""

docker network create "$network" >/dev/null
docker run -d --name "$php_container" --network "$network" --network-alias php --network-alias workerman "$image" >/dev/null
docker run -d --name "$nginx_container" --network "$network" \
    -p 127.0.0.1::80 \
    -v "$(pwd)/deploy/production/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$public_dir:/var/www/crmeb/public:ro" \
    nginx:1.27.5-alpine >/dev/null

port="$(docker port "$nginx_container" 80/tcp | sed 's/.*://')"
attempt=0
until curl --fail --silent --show-error "http://127.0.0.1:${port}/healthz" | grep -q '^ok$'; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        docker logs "$nginx_container" >&2
        exit 1
    fi
    sleep 1
done

docker exec "$nginx_container" nginx -t
echo "HTTP stack verification passed: $image"
