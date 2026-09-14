#!/usr/bin/env bash
set -Eeuo pipefail

image="${1:?usage: deploy/production/migrate-all-in-one.sh IMAGE [HOST]}"
host="${2:-x-zoo.vip}"
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
state_dir="${CRMEB_DEPLOY_DIR:-$project_dir/deployment}"
config_dir="$state_dir/config"
release_dir="$state_dir/releases/${image##*:}"
deployment_env="$state_dir/deployment.env"
old_compose="$project_dir/docker-compose.yml"
backup_compose="$state_dir/docker-compose.all-in-one.yml"
compose_file="$project_dir/deploy/production/compose.yml"
mysql_uid=""
mysql_gid=""
redis_uid=""
redis_gid=""
app_container=""

mkdir -p "$config_dir" "$release_dir/public"
if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull "$image"
fi
docker pull mysql:8.0.42
docker pull redis:5.0.14-bullseye
docker pull nginx:1.27.5-alpine
sh "$project_dir/docker/verify-image.sh" "$image"

if docker container inspect crmeb-mysql >/dev/null 2>&1; then
    mysql_uid="$(docker exec crmeb-mysql id -u mysql)"
    mysql_gid="$(docker exec crmeb-mysql id -g mysql)"
elif docker container inspect crmeb >/dev/null 2>&1 && docker exec crmeb id -u mysql >/dev/null 2>&1; then
    mysql_uid="$(docker exec crmeb id -u mysql)"
    mysql_gid="$(docker exec crmeb id -g mysql)"
fi

if docker container inspect crmeb-redis >/dev/null 2>&1; then
    redis_uid="$(docker exec crmeb-redis id -u redis)"
    redis_gid="$(docker exec crmeb-redis id -g redis)"
elif docker container inspect crmeb >/dev/null 2>&1 && docker exec crmeb id -u redis >/dev/null 2>&1; then
    redis_uid="$(docker exec crmeb id -u redis)"
    redis_gid="$(docker exec crmeb id -g redis)"
fi

if docker container inspect crmeb-php >/dev/null 2>&1; then
    app_container="crmeb-php"
elif docker container inspect crmeb >/dev/null 2>&1 && docker exec crmeb test -f /var/www/crmeb/.env; then
    app_container="crmeb"
fi

if [ -n "$app_container" ]; then
    docker cp "$app_container:/var/www/crmeb/.env" "$config_dir/.env"
    docker cp "$app_container:/var/www/crmeb/.constant" "$config_dir/.constant"
elif [ ! -s "$config_dir/.env" ]; then
    echo "Cannot find the running crmeb container or a saved application .env" >&2
    exit 1
fi

cp "$config_dir/.env" "$config_dir/.env.before-sidecars"
sed -Ei 's/^([[:space:]]*HOSTNAME[[:space:]]*=[[:space:]]*).*/\1mysql/' "$config_dir/.env"
sed -Ei 's/^([[:space:]]*REDIS_HOSTNAME[[:space:]]*=[[:space:]]*).*/\1redis/' "$config_dir/.env"
php_gid="$(docker run --rm --entrypoint sh "$image" -c 'id -g www-data')"
sudo chown "$(id -u):$php_gid" "$config_dir/.env"
chmod 640 "$config_dir/.env"
chmod 600 "$config_dir/.env.before-sidecars"
touch "$config_dir/.constant"
chmod 666 "$config_dir/.constant"

source_container="$(docker create "$image")"
cleanup_source() {
    docker rm -f "$source_container" >/dev/null 2>&1 || true
}
trap cleanup_source EXIT
rm -rf "$release_dir/public"
mkdir -p "$release_dir/public"
docker cp "$source_container:/var/www/crmeb/public/." "$release_dir/public/"
if [ -s "$config_dir/.constant" ]; then
    touch "$release_dir/public/install.lock"
fi
cleanup_source
source_container=""
trap - EXIT

cat >"$deployment_env" <<EOF
CRMEB_IMAGE=$image
CRMEB_HOST=$host
CRMEB_CONFIG_DIR=$config_dir
CRMEB_DATA_DIR=$project_dir/data
CRMEB_PUBLIC_DIR=$release_dir/public
EOF
chmod 600 "$deployment_env"

docker compose --env-file "$deployment_env" -f "$compose_file" config --quiet

rollback() {
    echo "Deployment failed; restoring the all-in-one container" >&2
    docker compose --env-file "$deployment_env" -f "$compose_file" down || true
    cp "$config_dir/.env.before-sidecars" "$config_dir/.env"
    if [ -n "$mysql_uid" ]; then
        sudo chown -R "$mysql_uid:$mysql_gid" "$project_dir/data/mysql"
    fi
    if [ -n "$redis_uid" ]; then
        sudo chown -R "$redis_uid:$redis_gid" "$project_dir/data/redis"
    fi
    if [ -f "$backup_compose" ]; then
        cp "$backup_compose" "$old_compose"
        docker compose -f "$old_compose" up -d
    fi
}
trap rollback ERR

if [ -f "$old_compose" ]; then
    cp "$old_compose" "$backup_compose"
    docker compose -f "$old_compose" down
fi

mysql_target="$(docker run --rm --entrypoint sh mysql:8.0.42 -c 'printf "%s:%s" "$(id -u mysql)" "$(id -g mysql)"')"
redis_target="$(docker run --rm --entrypoint sh redis:5.0.14-bullseye -c 'printf "%s:%s" "$(id -u redis)" "$(id -g redis)"')"
sudo chown -R "$mysql_target" "$project_dir/data/mysql"
sudo chown -R "$redis_target" "$project_dir/data/redis"

docker compose --env-file "$deployment_env" -f "$compose_file" up -d

for attempt in $(seq 1 60); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' crmeb 2>/dev/null || true)"
    if [ "$status" = healthy ]; then
        break
    fi
    if [ "$attempt" -eq 60 ]; then
        docker compose --env-file "$deployment_env" -f "$compose_file" ps
        docker compose --env-file "$deployment_env" -f "$compose_file" logs --tail 100
        false
    fi
    sleep 2
done

curl --fail --silent --show-error --max-time 20 "https://$host/healthz" | grep -q '^ok$'
curl --fail --silent --show-error --output /dev/null --max-time 30 "https://$host/"
trap - ERR

cp "$compose_file" "$old_compose"
cp "$project_dir/deploy/production/nginx.conf" "$project_dir/nginx.conf"
echo "Deployment succeeded: $image"
