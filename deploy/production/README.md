# CRMEB production updates

This runbook is for the existing `x-zoo.vip` server. Its repository remote points to upstream CRMEB; do not run `git pull` there to deploy this fork. CI publishes `ghcr.io/xiangyumou/crmeb:edge` only after builds and checks for the current master commit pass.

## First migration

1. Build and validate the complete release in CI. Check the `release-record-<SHA>` artifact and verify the published `edge` image contains the same full revision. Ensure there is a current MySQL backup and at least 5 GB free space.
2. Transfer the matching `deployment-config.tar.gz` artifact to `/home/ubuntu/apps/CRMEB` and extract it there. It contains `compose.yaml`, `deploy/production/compose.yml`, `deploy/production/nginx.conf`, `normalize.sh`, `rollback.sh`, and `docker/cache-assets.sh`. The existing `docker-compose.yml` remains available until the migration succeeds.
3. On the server run `bash deploy/production/normalize.sh --check`, then during a maintenance window run `bash deploy/production/normalize.sh --apply`. The script verifies a new database backup by restoring it to a disposable isolated MySQL container before stopping application services. It does not modify or restart the production database data directory.
4. Verify `docker compose ps`, `https://x-zoo.vip/readyz`, `/admin/`, `/pages/index/index`, `/api/version`, and `/notice`. Check logs for queue, timer and workerman. Keep the old image and all directories in `deployment/normalize-backups/` and `deployment/releases/`.

The first migration links root `.env` to `deployment/deployment.env`, switches `CRMEB_IMAGE` to `edge`, and removes `CRMEB_PUBLIC_DIR`. `deployment/config/.env`, `.constant`, `data/mysql`, `data/redis`, `data/uploads`, and `data/runtime` remain on the host. Never commit or print their secret values.

## Routine update

Run in `/home/ubuntu/apps/CRMEB`:

```sh
docker compose pull
docker compose up -d --wait --wait-timeout 180
docker compose ps
```

Plain `docker compose up -d` also works but returns before all health checks pass. Changes to the deployment topology or database schema are separate maintenance operations; `pull/up` alone cannot update a Compose file or migrate a database. If only an application image changes, MySQL and Redis must remain running and must not be force-recreated.

The admin and H5 files come from the same image as the backend. Old content-hashed browser assets are retained under `data/assets-cache`; do not clear that directory during a release. `/healthz` is the Nginx liveness probe, while `/readyz` also checks PHP, MySQL and Redis. A successful `/healthz` alone does not mean the site is ready.

## Rollback

Record the previous immutable `sha-<40-character commit>` tag or the `backendImageDigest` in the `release-record-<SHA>` artifact before an update. To pin a known-good image:

```sh
bash deploy/production/rollback.sh ghcr.io/xiangyumou/crmeb@sha256:<64-hex-digit-digest>
```

After fixing the issue, resume tracking the tested master release with `bash deploy/production/rollback.sh --edge`. The script checks the new containers and restores the previous image setting if their health check fails. Database changes are never rolled back by replacing containers; restore data only using a separately verified database recovery procedure.

The retired `migrate-all-in-one.sh` intentionally exits without changing services. Do not repeat a migration or run `docker compose down -v` in production.
