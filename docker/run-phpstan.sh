#!/usr/bin/env sh
# PHP 静态分析。用回归镜像的 vendor 阶段做符号解析，所以不需要宿主机装 PHP，
# 也不需要 MySQL/Redis——这同时是目前唯一一条不用起整套栈的快反馈回路。
#
# Usage: sh docker/run-phpstan.sh [TESTED_IMAGE]
#        sh docker/run-phpstan.sh [TESTED_IMAGE] --generate-baseline
set -eu

root="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
analysis_dir="$root/tests/static-analysis"
image="${1:-crmeb-test}"
shift 2>/dev/null || true

# phpunit 的 vendor 同样是按需装的（见 docker/run-regression.sh）；这里照同一个模式，
# 版本在 composer.json 里钉死，不用 caret 范围。
if [ ! -x "$analysis_dir/vendor/bin/phpstan" ]; then
    docker run --rm \
        -v "$analysis_dir:/app" \
        -w /app \
        composer:2.2.30 install --no-interaction --no-progress --prefer-dist
fi

# baseline 不存在时先建一个空的，好让 phpstan.neon 里的 baselineFile 始终可读。
if [ ! -f "$analysis_dir/phpstan-baseline.neon" ]; then
    printf 'parameters:\n\tignoreErrors: []\n' > "$analysis_dir/phpstan-baseline.neon"
fi

# 应用自身的 vendor 只存在于镜像里（仓库里是 gitignore 的），所以分析跑在镜像内，
# 把源码和这个分析项目挂进去。
exec docker run --rm \
    -v "$analysis_dir:/analysis" \
    -w /analysis \
    --entrypoint php \
    "$image" \
    -d memory_limit=1G \
    /analysis/vendor/bin/phpstan analyse \
    --configuration /analysis/phpstan.neon \
    --no-progress \
    "$@"
