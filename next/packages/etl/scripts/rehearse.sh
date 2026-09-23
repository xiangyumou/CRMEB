#!/usr/bin/env bash
#
# rehearse.sh <dump.sql> — the whole migration, locally, against a real dump.
#
# A cutover is not the time to discover that the dump has a table nobody
# expected, a config key nobody claimed or an attachment whose file is gone.
# This script does the entire thing on a throwaway pair of containers, so that
# all of those come out as an error message on a laptop rather than as a
# maintenance window that will not end.
#
#   ./rehearse.sh ~/dumps/shop-2026-09-22.sql
#   UPLOADS_ROOT=/mnt/legacy/uploads ./rehearse.sh ~/dumps/shop.sql
#
# It is safe to run repeatedly: the containers are named after the run and
# removed at the end, and the migration itself is idempotent, so a second
# `--all` pass over the same dump produces the same database.
#
# The dump stays where it is. It is bind-mounted read-only into the MySQL
# container and is never copied into this repository — a real dump must not end
# up in a working tree, a stash or a branch, and the easiest way to guarantee
# that is never to put it there.
#
# Nothing here reaches a production host. The only network access is to the
# container registry for postgres and mysql.

set -euo pipefail

usage() {
    cat >&2 <<'USAGE'
用法：rehearse.sh <dump.sql>

环境变量：
  UPLOADS_ROOT   旧 uploads 目录。给了就核对附件文件并算 sha256；
                 不给就跳过附件校验（verify 会明确说它跳过了）。
  KEEP           设成 1 则结束后保留容器，方便自己进去看。
  MYSQL_IMAGE    默认 mysql:8.0
  PG_IMAGE       默认 postgres:17-alpine

这个脚本只在本机的临时容器上跑，不会连接任何线上主机，也不会把 dump 复制进仓库。
USAGE
    exit 2
}

[ $# -eq 1 ] || usage
dump=$1
[ -f "$dump" ] || {
    echo "找不到 dump 文件：$dump" >&2
    exit 2
}
dump=$(cd -- "$(dirname -- "$dump")" && pwd)/$(basename -- "$dump")

here=$(cd -- "$(dirname -- "$0")" && pwd)
package=$(dirname -- "$here")

mysql_image=${MYSQL_IMAGE:-mysql:8.0}
pg_image=${PG_IMAGE:-postgres:17-alpine}
uploads_root=${UPLOADS_ROOT:-}

run_id=$(date +%Y%m%d%H%M%S)-$$
mysql_name="etl-rehearse-mysql-$run_id"
pg_name="etl-rehearse-pg-$run_id"
workdir=$(mktemp -d)

# These are throwaway containers on a random high port, reachable only from
# this machine, and they are destroyed at the end — so the password being
# visible is not a secret being leaked, it is a password that protects nothing.
# The connection strings still go to the CLI through the environment rather
# than argv, because that is the habit that matters when the database is real.
db_password='rehearsal-only-not-a-secret'

cleanup() {
    status=$?
    if [ "${KEEP:-0}" = "1" ]; then
        echo ""
        echo "KEEP=1，容器保留："
        echo "  mysql: $mysql_name"
        echo "  pg:    $pg_name"
        echo "  工作目录: $workdir"
    else
        docker rm -f "$mysql_name" "$pg_name" >/dev/null 2>&1 || true
        rm -rf "$workdir"
    fi
    exit "$status"
}
trap cleanup EXIT INT TERM

step() {
    echo ""
    echo "=== $* ==="
}

wait_for() {
    name=$1
    shift
    for _ in $(seq 1 180); do
        if docker exec "$@" >/dev/null 2>&1; then return 0; fi
        sleep 1
    done
    echo "$name 启动超时" >&2
    docker logs --tail 40 "$name" >&2 || true
    return 1
}

# ---------------------------------------------------------------------------

step "起容器"
docker run -d --name "$mysql_name" \
    -e MYSQL_ROOT_PASSWORD="$db_password" \
    -e MYSQL_DATABASE=crmeb_legacy \
    -v "$dump:/dump.sql:ro" \
    "$mysql_image" \
    --character-set-server=utf8mb4 \
    --collation-server=utf8mb4_general_ci >/dev/null
docker run -d --name "$pg_name" \
    -e POSTGRES_PASSWORD="$db_password" \
    -e POSTGRES_DB=shop \
    "$pg_image" >/dev/null

# Not `mysqladmin ping`: the MySQL entrypoint runs a temporary server while it
# initialises, and that server answers ping — so ping goes green a good while
# before root can actually log in, and the import then fails with "access
# denied" on a container that looked ready. An authenticated query is the only
# thing that means what it says here.
wait_for "$mysql_name" -e MYSQL_PWD="$db_password" "$mysql_name" \
    mysql -uroot -e 'select 1'
wait_for "$pg_name" "$pg_name" pg_isready -U postgres

mysql_host=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$mysql_name")
pg_host=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$pg_name")

step "导入 dump（原文件只读挂载，不会被改动）"
# Inside the container, so a multi-gigabyte dump never crosses the docker API.
# `MYSQL_PWD` rather than `-p…`: a password in argv is visible to every other
# process on the box through `ps`, and mysql itself warns about it.
docker exec -e MYSQL_PWD="$db_password" "$mysql_name" sh -c \
    'exec mysql -uroot --default-character-set=utf8mb4 crmeb_legacy < /dump.sql'

export LEGACY_MYSQL_URL="mysql://root:$db_password@$mysql_host:3306/crmeb_legacy"
export DATABASE_URL="postgres://postgres:$db_password@$pg_host:5432/shop"

step "建新库表结构"
(cd "$package/../db" && pnpm db:migrate)

step "写入基础数据（城市、快递公司、协议壳、通知模板壳）"
# 在迁移之前，不是之后：城市字典不随 dump 迁移，而是在这一步写入，并且沿用旧库的
# id，收货地址通过真正的外键指向它。没有这一步，etl run 会在动手之前直接拒绝——
# 这一步就是对那个拒绝的回答。种子本身是幂等的，重复跑不会改变任何东西。
(cd "$package/../db" && pnpm db:seed)

step "etl plan — 先看看这份 dump 里有什么"
(cd "$package" && pnpm etl plan)

# 两遍迁移用同一个"迁移时刻"。旧库里有些表根本没有时间可搬（比如附件分类），
# 这些行的 created_at 由迁移时刻填；不钉住它，两遍就会差几秒，而那是时钟在动，
# 不是数据在变。真实的重跑同理：把上一次打印出来的时刻传回去。
migrated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# `--require-complete`：还有 group 没落地就直接失败。每个 group 都已经落地，
# 所以演练和正式切换跑的是同一条命令。
migrate() {
    if [ -n "$uploads_root" ]; then
        (cd "$package" && pnpm etl run --require-complete --migrated-at "$migrated_at" --uploads-root "$uploads_root")
    else
        (cd "$package" && pnpm etl run --require-complete --migrated-at "$migrated_at")
    fi
}

step "etl run — 正式迁移（迁移时刻 $migrated_at）"
[ -n "$uploads_root" ] || echo "没有设置 UPLOADS_ROOT：附件的 sha256 算不出来，这些行会被丢弃并计数。"
migrate

step "etl run 第二遍 — 证明这件事可以重来"
# The point of a rehearsal is that the real thing can be done again if it goes
# wrong. If the second run does not produce the same database as the first,
# that is not true, and it is much better to find out here.
before="$workdir/dump-1.txt"
after="$workdir/dump-2.txt"
dump_pg() {
    # `--restrict-key` is random per invocation in newer pg_dump builds and
    # would make two identical databases compare differently; strip it.
    docker exec "$pg_name" pg_dump -U postgres --data-only --no-owner \
        --column-inserts shop | grep -v '^\\restrict\|^\\unrestrict' >"$1"
}
dump_pg "$before"
migrate
dump_pg "$after"
if diff -q "$before" "$after" >/dev/null; then
    echo "两遍迁移的结果完全一致。"
else
    echo "两遍迁移的结果不一致——迁移不是幂等的，切换前必须先查清楚：" >&2
    diff "$before" "$after" | head -40 >&2
    exit 1
fi

step "etl verify — 逐项比对新旧两边"
if [ -n "$uploads_root" ]; then
    (cd "$package" && pnpm etl verify --uploads-root "$uploads_root" --full-digest)
else
    (cd "$package" && pnpm etl verify)
fi

step "演练完成"
cat <<'DONE'
这一轮演练证明了：这份 dump 能完整导入、能迁移、迁两遍结果相同、verify 全部通过。

正式切换前还要确认的事情：
  * etl assets 的清单已经生成，uploads 已经复制过去，并且用 --full-digest 校验过；
  * 演练用的容器已经销毁（这个脚本默认会销毁，除非 KEEP=1）。
DONE
