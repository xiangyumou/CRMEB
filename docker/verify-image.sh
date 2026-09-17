#!/usr/bin/env sh
set -eu

image="${1:?usage: docker/verify-image.sh IMAGE}"
container_id=""
fixture_dir=""

cleanup() {
    if [ -n "$container_id" ]; then
        docker rm -f "$container_id" >/dev/null 2>&1 || true
    fi
    if [ -n "$fixture_dir" ]; then
        rm -rf "$fixture_dir"
    fi
}
trap cleanup EXIT INT TERM

docker run --rm --entrypoint php "$image" -r '
require "vendor/autoload.php";

$requiredExtensions = ["bcmath", "curl", "gd", "intl", "mbstring", "mysqli", "pcntl", "pdo_mysql", "redis", "sockets", "zip"];
foreach ($requiredExtensions as $extension) {
    if (!extension_loaded($extension)) {
        fwrite(STDERR, "Missing PHP extension: {$extension}\n");
        exit(1);
    }
}

if (!Composer\InstalledVersions::isInstalled("doctrine/cache")) {
    fwrite(STDERR, "doctrine/cache is absent from Composer metadata\n");
    exit(2);
}
if (!class_exists("Doctrine\Common\Cache\FilesystemCache")) {
    fwrite(STDERR, "Doctrine FilesystemCache cannot be autoloaded\n");
    exit(3);
}

$app = new EasyWeChat\Foundation\Application([]);
if (!$app["cache"] instanceof Doctrine\Common\Cache\FilesystemCache) {
    fwrite(STDERR, "EasyWeChat did not create its filesystem cache\n");
    exit(4);
}

$font = "vendor/fastknife/ajcaptcha/resources/fonts/WenQuanZhengHei.ttf";
if (!is_readable($font) || filesize($font) === 0) {
    fwrite(STDERR, "AJCaptcha font is missing or empty\n");
    exit(5);
}
if (!is_array(imagettfbbox(12, 0, $font, "CRMEB"))) {
    fwrite(STDERR, "AJCaptcha font cannot be rendered\n");
    exit(6);
}
'

docker run --rm --entrypoint sh "$image" -ec '
if command -v composer >/dev/null 2>&1; then
    echo "Composer must not be present in the runtime image" >&2
    exit 1
fi
if [ -e .env ] || [ -e .constant ] || [ -e .git ]; then
    echo "Runtime image contains environment secrets or Git metadata" >&2
    exit 1
fi
test -s public/index.html && test -s public/admin/index.html && test -s public/index.php
test -s public/install.lock && test ! -d public/install
test -s /usr/local/share/crmeb/build.json
find app config crmeb route -type f -name "*.php" -print0 \
    | xargs -0 -n1 php -l >/tmp/php-lint.log \
    || { cat /tmp/php-lint.log >&2; exit 1; }
'

fixture_dir="$(mktemp -d)"
test -s .build/release/build.json && test -d .build/release/public
mkdir -p "$fixture_dir/public"
container_id="$(docker create --entrypoint sh "$image" -c true)"
docker cp "$container_id:/var/www/crmeb/public/." "$fixture_dir/public"
docker cp "$container_id:/usr/local/share/crmeb/build.json" "$fixture_dir/build.json"
docker rm "$container_id" >/dev/null
container_id=""
cmp .build/release/build.json "$fixture_dir/build.json"
diff -qr --exclude=uploads .build/release/public "$fixture_dir/public"
printf 'installed\n' > "$fixture_dir/.constant"
container_id="$(docker run -d \
    -v "$(pwd)/docker/regression/test.env:/var/www/crmeb/.env:ro" \
    -v "$fixture_dir/.constant:/var/www/crmeb/.constant:ro" "$image")"
sleep 10

if [ "$(docker inspect -f '{{.State.Running}}' "$container_id")" != "true" ]; then
    docker logs "$container_id" >&2
    exit 1
fi

docker exec "$container_id" php-fpm -t
echo "Image verification passed: $image"
