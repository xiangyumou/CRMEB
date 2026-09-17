#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

# Use the PHP 7.4 image built by the regression runner, so host PHP is optional.
sh docker/run-regression.sh
docker run --rm -v "$root/crmeb:/lint:ro" crmeb-regression-regression \
    sh -c 'find /lint/app /lint/crmeb /lint/route /lint/upgrade/core-store -type f -name "*.php" -exec sh -c '\''for file do php -l "$file" >/dev/null || exit 1; done'\'' sh {} +'
node tests/static/core-store-front.cjs
node tests/static/admin-api-contract.cjs
node tests/static/verify-release-test.cjs
node tests/static/wechat-payment-test.mjs
