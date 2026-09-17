#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:?usage: normalize.sh --check|--apply}"
[[ "$mode" = --check || "$mode" = --apply ]] || { echo 'Expected --check or --apply' >&2; exit 2; }
root="$(cd "$(dirname "$0")/../.." && pwd)"
state="$root/deployment"
settings="$state/deployment.env"
old_compose="$root/docker-compose.yml"
image=ghcr.io/xiangyumou/crmeb:edge

test -s "$settings" && test -s "$state/config/.env" && test -s "$state/config/.constant"
test -d "$root/data/mysql" && test -d "$root/data/redis" && test -d "$root/data/uploads"
test -s "$root/compose.yaml" && test -s "$root/deploy/production/compose.yml"
if [ -L "$root/.env" ] && [ ! -e "$old_compose" ]; then
  docker compose --project-directory "$root" -f "$root/compose.yaml" config --quiet
  docker compose --project-directory "$root" -f "$root/compose.yaml" ps
  curl -fsS --max-time 15 "https://$(sed -n 's/^CRMEB_HOST=//p' "$settings")/readyz" -o /dev/null
  echo 'Already migrated; no services changed'
  exit 0
fi
test -s "$old_compose" || { echo 'Legacy Compose is absent; migration may already be complete' >&2; exit 1; }
old_image="$(sed -n 's/^CRMEB_IMAGE=//p' "$settings")"
old_public="$(sed -n 's/^CRMEB_PUBLIC_DIR=//p' "$settings")"
old_host="$(sed -n 's/^CRMEB_HOST=//p' "$settings")"
test -n "$old_image" && test -f "$old_public/index.php" && test -n "$old_host"
test -f "$old_public/install.lock"
test ! -e "$root/.env" && test ! -L "$root/.env"
test "$(df -Pk "$root" | awk 'NR==2 {print $4}')" -ge 5242880 || { echo 'At least 5 GB free space is required' >&2; exit 1; }
docker image inspect "$old_image" >/dev/null
docker compose --env-file "$settings" -f "$old_compose" config --quiet
old_project="$(docker compose --env-file "$settings" -f "$old_compose" config --format json | jq -r .name)"
new_project="$(docker compose --env-file "$settings" -f "$root/compose.yaml" config --format json | jq -r .name)"
test "$old_project" = "$new_project" || { echo 'Compose project names differ; do not migrate automatically' >&2; exit 1; }
old_database_services="$(docker compose --env-file "$settings" -f "$old_compose" config --format json | jq -cS '[.services.mysql,.services.redis]')"
new_database_services="$(docker compose --env-file "$settings" -f "$root/compose.yaml" config --format json | jq -cS '[.services.mysql,.services.redis]')"
test "$old_database_services" = "$new_database_services" || { echo 'Database service definitions differ; do not migrate automatically' >&2; exit 1; }
docker compose --env-file "$settings" -f "$old_compose" ps --status running --services | grep -qx mysql
docker compose --env-file "$settings" -f "$old_compose" ps --status running --services | grep -qx redis
docker compose --env-file "$settings" -f "$old_compose" ps --status running --services | grep -qx php
test "$(docker inspect crmeb-mysql -f '{{index .Config.Labels "com.docker.compose.project"}}')" = crmeb-production
test "$(docker inspect crmeb-redis -f '{{index .Config.Labels "com.docker.compose.project"}}')" = crmeb-production
docker manifest inspect "$image" >/dev/null
echo 'Preflight passed; no services changed'
[[ "$mode" = --apply ]] || exit 0

docker pull "$image"
docker run --rm --entrypoint sh "$image" -ec 'test -s public/admin/index.html && test -s public/index.html && test -s public/install.lock && test -s /usr/local/share/crmeb/build.json'
mkdir -p "$state/normalize-backups" "$root/data/backups" "$root/data/assets-cache"
backup="$(mktemp -d "$state/normalize-backups/run-XXXXXXXX")"
cp -p "$old_compose" "$backup/docker-compose.yml"
cp -p "$settings" "$backup/deployment.env"
cp -p "$root/nginx.conf" "$backup/nginx.conf"
docker image inspect "$old_image" --format '{{.Id}}' > "$backup/previous-image-id"
docker image inspect "$old_image" --format '{{range .RepoDigests}}{{println .}}{{end}}' > "$backup/previous-image-digests"
docker inspect crmeb-mysql --format '{{.Id}}' > "$backup/previous-mysql-container-id"
docker inspect crmeb-redis --format '{{.Id}}' > "$backup/previous-redis-container-id"
printf '%s\n' "$old_public" > "$backup/previous-public-dir"
chmod 700 "$backup"
bash "$root/docker/cache-assets.sh" "$old_public" "$root/data/assets-cache"

database_dump="$root/data/backups/pre-normalize-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker exec crmeb-mysql sh -ec 'MYSQL_PWD="$PASSWORD" mysqldump --no-tablespaces -h127.0.0.1 -u"$USERNAME" --single-transaction --routines --events --triggers --set-gtid-purged=OFF "$DATABASE"' | gzip > "$database_dump"
gzip -t "$database_dump"
test "$(gzip -cd "$database_dump" | wc -c)" -gt 1024
chmod 600 "$database_dump"

restore_name="crmeb-restore-check-$$"
restore_volume="$restore_name"
restore_password="$(openssl rand -hex 20)"
docker volume create "$restore_volume" >/dev/null
cleanup_restore() {
  docker rm -f "$restore_name" >/dev/null 2>&1 || true
  docker volume rm "$restore_volume" >/dev/null 2>&1 || true
}
trap cleanup_restore EXIT
docker run -d --name "$restore_name" --network none \
  -e "MYSQL_ROOT_PASSWORD=$restore_password" -e MYSQL_DATABASE=restore_check \
  -v "$restore_volume:/var/lib/mysql" mysql:8.0.42 >/dev/null
for attempt in $(seq 1 60); do
  if docker exec -e "MYSQL_PWD=$restore_password" "$restore_name" mysql -uroot -N -e 'SELECT 1' >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 60 ]; then echo 'Isolated MySQL restore did not start' >&2; exit 1; fi
  sleep 2
done
gzip -cd "$database_dump" | docker exec -i -e "MYSQL_PWD=$restore_password" "$restore_name" mysql -uroot restore_check
table_count="$(docker exec -e "MYSQL_PWD=$restore_password" "$restore_name" mysql -uroot -N -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema="restore_check"')"
test "$table_count" -gt 0 || { echo 'Isolated MySQL restore is empty' >&2; exit 1; }
cleanup_restore
trap - EXIT
echo "Database backup and isolated restore verified: $database_dump"

new_settings="$backup/deployment.env.new"
sed -e "s|^CRMEB_IMAGE=.*|CRMEB_IMAGE=$image|" -e '/^CRMEB_PUBLIC_DIR=/d' "$settings" > "$new_settings"
chmod 600 "$new_settings"
failed=1
recover() {
  if [ "$failed" -eq 1 ]; then
    trap - ERR
    echo 'Migration failed; restoring previous application configuration' >&2
    cp -p "$backup/deployment.env" "$settings"
    cp -p "$backup/docker-compose.yml" "$old_compose"
    if [ -L "$root/.env" ]; then unlink "$root/.env"; fi
    mv "$root/compose.yaml" "$backup/compose.yaml.failed"
    docker compose --env-file "$settings" -f "$old_compose" up -d --wait --wait-timeout 180 || echo 'Legacy recovery needs manual attention' >&2
  fi
}
trap recover ERR
docker compose --env-file "$settings" -f "$old_compose" stop nginx php queue timer workerman
cp -p "$new_settings" "$settings"
ln -s deployment/deployment.env "$root/.env"
docker compose --project-directory "$root" -f "$root/compose.yaml" config --quiet
docker compose --project-directory "$root" -f "$root/compose.yaml" up -d --wait --wait-timeout 180
for path in /readyz /admin/index.html /index.html /api/version; do
  curl -fsS --max-time 15 "https://$old_host$path" -o /dev/null
done
test "$(docker inspect crmeb-mysql -f '{{.Id}}')" = "$(cat "$backup/previous-mysql-container-id")"
test "$(docker inspect crmeb-redis -f '{{.Id}}')" = "$(cat "$backup/previous-redis-container-id")"
failed=0
trap - ERR
mv "$old_compose" "$backup/docker-compose.yml.root"
echo "Migration succeeded; legacy deployment preserved in $backup"
