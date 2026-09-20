#!/usr/bin/env sh
# Bring up the real multi-container topology (its own MySQL, Redis, PHP, workerman
# and nginx) and prove the release is usable and that the health probes actually
# fail when a role is broken. Reusing the PHP container as a fake workerman is not
# accepted here: the Channel server lives in its own process.
set -eu

image="${1:?usage: docker/verify-http-stack.sh IMAGE}"
root="$(pwd)"
network="crmeb-http-check-$$"
php_container="crmeb-http-php-$$"
workerman_container="crmeb-http-workerman-$$"
nginx_container="crmeb-http-nginx-$$"
mysql_container="crmeb-http-mysql-$$"
redis_container="crmeb-http-redis-$$"
queue_container="crmeb-http-queue-$$"
timer_container="crmeb-http-timer-$$"
fixture_dir="$(mktemp -d)"

cleanup() {
    docker rm -f "$nginx_container" "$php_container" "$workerman_container" "$mysql_container" "$redis_container" "$queue_container" "$timer_container" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    rm -rf "$fixture_dir"
}
trap cleanup EXIT INT TERM

fail() {
    echo "HTTP stack verification failed: $1" >&2
    docker logs "$nginx_container" >&2 2>/dev/null || true
    docker logs "$workerman_container" >&2 2>/dev/null || true
    docker logs "$php_container" >&2 2>/dev/null || true
    exit 1
}

# The fixture keeps the regression settings (mysql/redis/workerman hostnames) and
# has to be a real file: the entrypoint refuses to start without one.
cp "$root/docker/regression/test.env" "$fixture_dir/.env"
cp "$root/docker/regression/test.constant" "$fixture_dir/.constant"
sed 's/^CLIENT_IP = .*/CLIENT_IP = no-such-channel-host/' "$fixture_dir/.env" > "$fixture_dir/.env.bad-channel"

docker network create "$network" >/dev/null

docker run -d --name "$redis_container" --network "$network" --network-alias redis \
    redis:5.0.14-bullseye >/dev/null
docker run -d --name "$mysql_container" --network "$network" --network-alias mysql \
    -e MYSQL_DATABASE=crmeb_regression -e MYSQL_ROOT_PASSWORD=regression \
    -v "$root/crmeb/public/install/crmeb.sql:/docker-entrypoint-initdb.d/001-crmeb.sql:ro" \
    mysql:8.0.42 \
    --default-authentication-plugin=mysql_native_password \
    --sql-mode=ONLY_FULL_GROUP_BY,NO_ENGINE_SUBSTITUTION >/dev/null

# mysqladmin answers before the init SQL finishes, so wait for a table this
# release depends on: that is also what makes /readyz pass.
attempt=0
until docker exec "$mysql_container" mysql -uroot -pregression -N \
        -D crmeb_regression -e 'SELECT 1 FROM eb_store_order_effect LIMIT 0' >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
        docker logs "$mysql_container" >&2
        fail 'the install schema never became available'
    fi
    sleep 2
done

docker run -d --name "$php_container" --network "$network" --network-alias php \
    -v "$fixture_dir/.env:/var/www/crmeb/.env:ro" \
    -v "$fixture_dir/.constant:/var/www/crmeb/.constant:ro" "$image" php >/dev/null
docker run -d --name "$workerman_container" --network "$network" --network-alias workerman \
    -v "$fixture_dir/.env:/var/www/crmeb/.env:ro" \
    -v "$fixture_dir/.constant:/var/www/crmeb/.constant:ro" "$image" workerman >/dev/null
# The queue and timer roles run the same worker image with their own command. They
# were missing from this topology test entirely, so a release could ship with a
# queue role whose heartbeat never appears and nobody would notice here.
# Before the queue role exists, nothing has ever written its heartbeat: the probe
# must refuse. Checked here — with no consumer running — rather than after the
# consumer starts, where the only honest failure would take a stale-heartbeat
# window to appear.
if docker exec "$php_container" php /opt/crmeb/healthcheck.php queue >/dev/null 2>&1; then
    fail 'the queue probe passed without a running consumer'
fi
docker run -d --name "$queue_container" --network "$network" \
    -v "$fixture_dir/.env:/var/www/crmeb/.env:ro" \
    -v "$fixture_dir/.constant:/var/www/crmeb/.constant:ro" "$image" queue >/dev/null
docker run -d --name "$timer_container" --network "$network" \
    -v "$fixture_dir/.env:/var/www/crmeb/.env:ro" \
    -v "$fixture_dir/.constant:/var/www/crmeb/.constant:ro" "$image" timer >/dev/null
docker run -d --name "$nginx_container" --network "$network" -p 127.0.0.1::80 \
    -v "$fixture_dir/.env:/var/www/crmeb/.env:ro" "$image" nginx >/dev/null

port="$(docker port "$nginx_container" 80/tcp | sed 's/.*://')"
attempt=0
until curl --fail --silent "http://127.0.0.1:${port}/healthz" | grep -q '^ok$'; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        fail 'nginx never answered /healthz'
    fi
    sleep 1
done

# /readyz reaches PHP over FastCGI and then MySQL and Redis, so it only turns
# green once the whole request path works.
attempt=0
until curl --fail --silent "http://127.0.0.1:${port}/readyz" | grep -q '"ready":true'; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
        fail 'the readiness endpoint never reported ready'
    fi
    sleep 2
done

docker exec "$nginx_container" nginx -t >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${port}/admin/index.html" | grep -q '<html' || fail 'the admin bundle is not served'
curl --fail --silent --show-error "http://127.0.0.1:${port}/index.html" | grep -q '<html' || fail 'the H5 bundle is not served'

# Each role has to be able to prove its own health.
docker exec "$php_container" php /opt/crmeb/healthcheck.php php | grep -q 'healthy\[php\]' || fail 'the php probe rejected a working pool'
docker exec "$php_container" php /opt/crmeb/healthcheck.php workerman | grep -q 'healthy\[workerman\]' \
    || fail 'the workerman probe could not complete a Channel round trip'

# The queue and timer roles need a heartbeat before their probes can pass.
attempt=0
until docker exec "$queue_container" php /opt/crmeb/healthcheck.php queue | grep -q 'healthy\[queue\]'; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
        docker logs "$queue_container" >&2
        fail 'the queue probe never passed with a running consumer'
    fi
    sleep 2
done
attempt=0
until docker exec "$timer_container" php /opt/crmeb/healthcheck.php timer | grep -q 'healthy\[timer\]'; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
        docker logs "$timer_container" >&2
        fail 'the timer probe never passed with a running timer'
    fi
    sleep 2
done

# ... and has to fail when the thing it checks is broken.
if docker run --rm --entrypoint php --network "$network" \
        -v "$fixture_dir/.env.bad-channel:/var/www/crmeb/.env:ro" \
        -v "$fixture_dir/.constant:/var/www/crmeb/.constant:ro" \
        "$image" /opt/crmeb/healthcheck.php workerman >/dev/null 2>&1; then
    fail 'the workerman probe passed with an unreachable Channel address'
fi
# Queue and timer verify their own configured Channel address too, so the same
# broken address must fail their probes even while their heartbeat is fresh.
if docker run --rm --entrypoint php --network "$network" \
        -v "$fixture_dir/.env.bad-channel:/var/www/crmeb/.env:ro" \
        -v "$fixture_dir/.constant:/var/www/crmeb/.constant:ro" \
        "$image" /opt/crmeb/healthcheck.php queue >/dev/null 2>&1; then
    fail 'the queue probe passed with an unreachable Channel address'
fi

# Stopping workerman takes the Channel server down: every role that depends on it
# must turn unhealthy instead of staying green on a stale heartbeat.
docker stop "$workerman_container" >/dev/null
if docker exec "$queue_container" php /opt/crmeb/healthcheck.php queue >/dev/null 2>&1; then
    fail 'the queue probe stayed healthy after the Channel server stopped'
fi

# A missing unique index silently removes the concurrency protection, so /readyz
# must refuse even though every table is still there.
docker exec "$mysql_container" mysql -uroot -pregression -D crmeb_regression \
    -e 'ALTER TABLE eb_store_order_payment_attempt DROP INDEX out_trade_no' >/dev/null 2>&1
attempt=0
until [ "$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:${port}/readyz")" = 503 ]; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        fail 'the readiness endpoint stayed green without the payment-attempt unique index'
    fi
    sleep 1
done
docker exec "$mysql_container" mysql -uroot -pregression -D crmeb_regression \
    -e 'ALTER TABLE eb_store_order_payment_attempt ADD UNIQUE KEY out_trade_no (out_trade_no)' >/dev/null 2>&1
attempt=0
until curl --fail --silent "http://127.0.0.1:${port}/readyz" | grep -q '"ready":true'; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        fail 'the readiness endpoint did not recover after the index was restored'
    fi
    sleep 1
done

docker stop "$mysql_container" >/dev/null
attempt=0
until [ "$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:${port}/readyz")" = 503 ]; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        fail 'the readiness endpoint stayed green without a database'
    fi
    sleep 1
done

echo "HTTP stack verification passed: $image"
