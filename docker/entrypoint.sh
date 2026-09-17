#!/usr/bin/env bash
set -Eeuo pipefail

role="${1:-php}"
case "$role" in
  php|queue|timer|workerman)
    if ! test -s /var/www/crmeb/.env || ! test -s /var/www/crmeb/.constant || ! test -f /var/www/crmeb/public/install.lock; then
      echo 'Application config or installation marker is missing' >&2
      exit 1
    fi
    ;;
  nginx)
    bash /usr/local/bin/crmeb-cache-assets /var/www/crmeb/public /var/cache/crmeb/assets
    ;;
  *) echo "Unknown role: $role" >&2; exit 1 ;;
esac

case "$role" in
  php) exec php-fpm -F ;;
  queue) exec php think queue:listen --queue ;;
  timer) exec php think timer start ;;
  workerman) exec php think workerman start ;;
  nginx) exec nginx -g 'daemon off;' ;;
esac
