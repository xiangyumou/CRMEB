#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"

# The tested image is built from the current revision:
#   docker build --build-arg VCS_REF="$(git rev-parse HEAD)" -t crmeb-test .
# Use the PHP 7.4 image built by the regression runner, so host PHP is optional.
image=${1:-crmeb-test}
sh docker/run-regression.sh "$image"
# `crmeb/upgrade` as a whole: the migration scripts and anything future versions
# add there used to sit outside every check.
docker run --rm --entrypoint sh -v "$root/crmeb:/lint:ro" crmeb-regression-regression \
    -c 'find /lint/app /lint/crmeb /lint/route /lint/upgrade -type f -name "*.php" -exec sh -c '\''for file do php -l "$file" >/dev/null || exit 1; done'\'' sh {} +'
node tests/static/core-store-front.cjs
node tests/static/admin-api-contract.cjs
node tests/static/retired-code-guard.cjs
node tests/static/install-sql-guard.cjs
node tests/static/model-relation-guard.cjs
node tests/static/php-symbol-guard.cjs
node tests/static/event-payload-guard.cjs
node tests/static/deployment-topology-guard.cjs
node tests/static/release-pipeline-guard.cjs
node tests/static/verify-release-test.cjs
# 发布与备份/回滚规则要对着真实 registry 与真实数据库跑一遍，而不是只读脚本
bash tests/deployment/publish-release.sh
bash tests/deployment/upgrade-rollback.sh "$image"
node tests/static/wechat-payment-test.mjs
