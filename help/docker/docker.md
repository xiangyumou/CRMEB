# CRMEB Docker 镜像

## 镜像契约

- 镜像：`ghcr.io/xiangyumou/crmeb`
- 架构：`linux/amd64`、`linux/arm64`
- 进程：PHP-FPM 7.4，监听 `9000`
- 应用目录：`/var/www/crmeb`
- 持久化目录：`/var/www/crmeb/runtime`、`/var/www/crmeb/public/uploads`
- 外部服务：Nginx、MySQL 5.7-8.0、Redis

镜像不包含数据库、Redis、Nginx、`.env` 或支付证书。不要把密钥构建进镜像；通过部署平台的环境变量、Secret 或只读文件挂载提供配置。

## 镜像标签

| 标签 | 用途 |
| --- | --- |
| `edge` | `master` 最新构建，仅用于联调和预发布 |
| `sha-xxxxxxx` | 对应唯一 Git 提交，可审计和回滚 |
| `X.Y.Z` | 正式发布的精确版本 |
| `X.Y` / `X` | 正式发布的兼容版本系列 |
| `latest` | 最新正式 `vX.Y.Z` 发布，不跟随日常提交 |

## 拉取和检查

```bash
docker pull ghcr.io/xiangyumou/crmeb:latest
docker run --rm ghcr.io/xiangyumou/crmeb:latest php -v
docker run --rm ghcr.io/xiangyumou/crmeb:latest php-fpm -t
```

直接启动 PHP-FPM：

```bash
docker run -d \
  --name crmeb-php \
  --restart unless-stopped \
  -p 9000:9000 \
  -v crmeb_runtime:/var/www/crmeb/runtime \
  -v crmeb_uploads:/var/www/crmeb/public/uploads \
  ghcr.io/xiangyumou/crmeb:latest
```

Nginx 必须使用同一发布版本的 `public/` 静态文件，将 PHP 请求转发到 `crmeb-php:9000`，并将 `SCRIPT_FILENAME` 设置为 `/var/www/crmeb/public$fastcgi_script_name`。不要把宿主机源码目录覆盖挂载到 `/var/www/crmeb`，否则会隐藏镜像中经过验证的依赖。

## 本地构建

```bash
docker build -t crmeb:local .
sh docker/verify-image.sh crmeb:local
```

Docker 构建不会使用工作区中的 `crmeb/vendor`。所有 PHP 依赖都由 Composer 根据 `composer.lock` 在干净目录中安装，构建会检查 Doctrine 缓存类和 AJCaptcha 字体是否可用。

## CI/CD

`.github/workflows/container.yml` 在 Pull Request 中验证 amd64 和 arm64 镜像，但不推送。合并到 `master` 后发布 `edge` 和不可变的 `sha-*` 标签。

正式发布使用语义化 Git 标签：

```bash
git tag v6.0.1
git push origin v6.0.1
```

流水线验证标签格式后发布 `6.0.1`、`6.0`、`6` 和 `latest`。GHCR 登录使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需在仓库中保存镜像仓库密码。

## 运行时配置

数据库、Redis 和应用配置沿用 ThinkPHP 的环境变量或外部 `.env`。生产部署至少应提供数据库地址、数据库名、用户名、密码以及 Redis 地址。支付证书应作为只读 Secret 挂载，并由 CRMEB 后台配置引用。

队列、定时任务和 Workerman 使用同一个不可变镜像启动独立容器，并覆盖默认命令：

```bash
php think queue:listen --queue
php think timer start
php think workerman start
```

不要在 PHP-FPM 容器内部以守护模式启动这些后台进程。
