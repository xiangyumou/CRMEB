# CRMEB 生产更新手册 (x-zoo.vip)

本手册适用于现有服务器 `ubuntu@43.142.105.205`，不是 CRMEB 官方的 Docker 安装教程。服务器上的 Git `origin` 指向官方 `crmeb/CRMEB`，而生产镜像由 `xiangyumou/CRMEB` 构建并发布到 `ghcr.io/xiangyumou/crmeb`。**不要在服务器上执行 `git pull` 来更新这套部署。**

## 目录与前提

- 项目目录：`/home/ubuntu/apps/CRMEB`；Compose 文件：`deploy/production/compose.yml`，根目录 `docker-compose.yml` 是它的副本。
- Compose 变量在 `deployment/deployment.env`：`CRMEB_IMAGE`、`CRMEB_HOST`、`CRMEB_CONFIG_DIR`、`CRMEB_DATA_DIR`、`CRMEB_PUBLIC_DIR`。应用密钥在 `deployment/config/.env`，不要提交或输出其内容。
- 每个版本的 `public` 文件从镜像提取到 `deployment/releases/<镜像标签>/public`。MySQL、Redis、上传文件和运行数据在 `data/` 下持久化。只更新 PHP 镜像不会更新前端文件。
- 服务器需要 Docker、Compose、GHCR 访问权限、外部网络 `server-internal-net` 和用于调整数据目录权限的 sudo 权限。更新前先确认有可恢复的数据库备份；回退镜像不会回退数据库。
- 服务器的 `deploy/` 当前不是其 Git 仓库跟踪的目录；向 `xiangyumou/CRMEB` 推送文档或脚本不会自动更新服务器上的副本。修改部署工具时需要单独同步并核对服务器文件。
- 用 `edge`（`master` 的 CI 测试通过后发布）发现最新镜像，再使用对应的固定 `sha-xxxxxxx` 标签部署。`latest` 仅在打版本标签时发布。

## 更新

连接服务器并进入项目目录：

```bash
ssh ubuntu@43.142.105.205
cd /home/ubuntu/apps/CRMEB
```

在部署目录之外记录当前镜像和发布路径，以便故障时恢复。先检查现有服务状态：

```bash
grep -E '^(CRMEB_IMAGE|CRMEB_PUBLIC_DIR|CRMEB_HOST)=' deployment/deployment.env
docker compose --env-file deployment/deployment.env -f deploy/production/compose.yml ps
```

从 `edge` 解析固定镜像标签。镜像的 revision 标签必须是 40 位 Git SHA，而且 `edge` 与固定标签的镜像 ID 必须相同：

```bash
docker pull ghcr.io/xiangyumou/crmeb:edge
revision=$(docker image inspect ghcr.io/xiangyumou/crmeb:edge --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Missing image revision'; exit 1; }
image="ghcr.io/xiangyumou/crmeb:sha-${revision:0:7}"
docker pull "$image"
test "$(docker image inspect "$image" --format '{{.Id}}')" = "$(docker image inspect ghcr.io/xiangyumou/crmeb:edge --format '{{.Id}}')" || { echo 'Image tags differ'; exit 1; }
printf 'Candidate: %s\n' "$image"
```

如果 `CRMEB_IMAGE` 已是该候选镜像，**停止**；不要对正在挂载的同一个发布目录重复运行脚本。否则执行：

```bash
bash deploy/production/migrate-all-in-one.sh "$image" x-zoo.vip
```

脚本会校验镜像、提取 `public`、写入 `deployment/deployment.env`，然后重建所有服务（包括 MySQL 和 Redis），会短暂中断访问。**不能**替换为 `docker compose pull && docker compose up -d`：Compose 需要 `--env-file`，而 `pull/up` 也不会提取新版 `public` 文件。不要删除 `data/`、`deployment/config/` 或旧的 `deployment/releases/` 目录。

## 验证

即使脚本返回非零，也要执行以下检查：

```bash
grep -E '^(CRMEB_IMAGE|CRMEB_PUBLIC_DIR)=' deployment/deployment.env
docker compose --env-file deployment/deployment.env -f deploy/production/compose.yml ps
docker inspect crmeb-php crmeb-queue crmeb-timer crmeb-workerman --format '{{.Name}} {{.Config.Image}} {{.State.Status}}'
for path in /healthz / /admin/ /adminapi/auth; do
  curl --max-time 15 -sS -o /dev/null -w "$path %{http_code}\n" "https://x-zoo.vip$path"
done
docker compose --env-file deployment/deployment.env -f deploy/production/compose.yml logs --since 5m --tail 100
```

预期：`crmeb`、`crmeb-php`、MySQL、Redis 显示 healthy；队列、定时器、Workerman 显示 running；四个 URL 都返回 HTTP 200，`/healthz` 的响应内容为 `ok`。确认 `CRMEB_IMAGE` 与四个应用容器的标签一致。`/adminapi/auth` 的 HTTP 200 可能包含应用层的未登录响应，这是正常的。

## 失败与人工回退

目前 `migrate-all-in-one.sh` 的回滚逻辑**不能可靠用于重复更新**：它先写入新版 `deployment.env`，回滚时仍复用新版镜像和发布路径。外部 URL 检查曾因瞬时 404 使脚本返回失败，但新镜像实际上仍在运行。看到 `Deployment failed` 不能认定旧版本已恢复；先按上节验证，并在 Nginx healthy 后重试外部检查。

如果持续失败，先确认旧镜像仍存在，且旧发布目录内有 `public/index.php`。把 `deployment/deployment.env` 中的 `CRMEB_IMAGE` 和 `CRMEB_PUBLIC_DIR` **仅这两项**改回更新前记录的值（例如用 `sudoedit deployment/deployment.env`），再执行：

```bash
docker compose --env-file deployment/deployment.env -f deploy/production/compose.yml config --quiet
docker compose --env-file deployment/deployment.env -f deploy/production/compose.yml up -d --force-recreate
```

重复验证检查。不要使用 Compose 回退 MySQL 数据目录。如果旧镜像或旧发布目录缺失，或者这次更新改变了数据库结构，停止操作，按经过验证的备份恢复方案处理；不要猜测只回退容器就足够。

本手册不会让现有脚本变成原子发布，也没有增加自动回滚；这些需要单独修改脚本并做部署测试。
