# CRMEB production updates

This runbook is for the existing `x-zoo.vip` server. Its repository remote points to upstream CRMEB; do not run `git pull` there to deploy this fork. CI publishes `ghcr.io/xiangyumou/crmeb:edge` only after builds and checks for the current master commit pass.

## First migration

1. Build and validate the complete release in CI. Download `release.json` and `deployment-config.tar.gz` from the GitHub Release named `sha-<full commit>` (for example, `gh release download sha-<full commit> --repo xiangyumou/CRMEB --pattern release.json --pattern deployment-config.tar.gz`). Verify the published `edge` image contains the same full revision and digest as `release.json`. Ensure there is a current MySQL backup and at least 5 GB free space.
2. Transfer `deployment-config.tar.gz` to `/home/ubuntu/apps/CRMEB` and extract it there. It contains `compose.yaml`, `deploy/production/compose.yml`, `deploy/production/nginx.conf`, `normalize.sh`, `rollback.sh`, and `docker/cache-assets.sh`. The existing `docker-compose.yml` remains available until the migration succeeds.
3. On the server run `bash deploy/production/normalize.sh --check`, then during a maintenance window run `bash deploy/production/normalize.sh --apply`. The script verifies a new database backup by restoring it to a disposable isolated MySQL container before stopping application services. It does not modify or restart the production database data directory.
4. Verify `docker compose ps`, `https://x-zoo.vip/readyz`, `/admin/`, `/pages/index/index`, `/api/version`, and `/notice`. Check logs for queue, timer and workerman. Keep the old image and all directories in `deployment/normalize-backups/` and `deployment/releases/`.

The first migration links root `.env` to `deployment/deployment.env`, switches `CRMEB_IMAGE` to `edge`, and removes `CRMEB_PUBLIC_DIR`. `deployment/config/.env`, `.constant`, `data/mysql`, `data/redis`, `data/uploads`, and `data/runtime` remain on the host. Never commit or print their secret values.

PHP-FPM runs as uid 33 (`www-data`), and the image is built with `public/uploads` and `runtime` owned by that user. A host bind mount replaces that ownership, so `chown -R 33:33 data/uploads data/runtime` once on the server: a root-owned `data/uploads` makes every product-image upload, the customer QR code upload and the group-buy poster fail with `mkdir(): Permission denied`.

## Routine update

Run in `/home/ubuntu/apps/CRMEB`:

```sh
docker compose pull
docker compose up -d --wait --wait-timeout 180
docker compose ps
```

Plain `docker compose up -d` also works but returns before all health checks pass. Changes to the deployment topology or database schema are separate maintenance operations; `pull/up` alone cannot update a Compose file or migrate a database, so a schema-changing release follows the next section instead. If only an application image changes, MySQL and Redis must remain running and must not be force-recreated.

The admin and H5 files come from the same image as the backend. Old content-hashed browser assets are retained under `data/assets-cache`; do not clear that directory during a release. `/healthz` is the Nginx liveness probe; `/readyz` proves the application is installed, the retained business tables and the order-reliability columns exist and the settings table is populated, on top of MySQL and Redis. A successful `/healthz` alone does not mean the site is ready, and `/readyz` is what fails on a database that has not run the migration.

`up -d --wait` now waits on a healthcheck for every application role, not just PHP and Nginx: PHP issues a real FastCGI request through the pool, the queue and timer roles publish a heartbeat from the loop that does the work, and Workerman has to answer an application-level round trip on the Channel server. A stack that prints `running` because a process merely started is no longer possible; a role whose worker died turns unhealthy.

## Schema migration release

A release that changes the database schema cannot use the routine update. The
order-reliability release adds `store_order_payment_attempt`, `store_order_effect`
and the two `store_order_refund` refund columns, and the new stack refuses to come up
without them: the PHP healthcheck issues a real `/readyz` request through the pool,
and `/readyz` answers 503 while those objects are missing. So `up -d --wait` fails on
a database that has not been migrated, which is the intended signal and not a reason
to relax the check. Migrate with the writers stopped, then start the same image.

Both scripts ship inside the image at `/var/www/crmeb/upgrade/core-store/`. They are
CLI-only and read the database settings from `deployment/config/.env`, which the `php`
service already mounts. Start them with `--entrypoint php` so the container runs the
script instead of the application role it starts by default. Never migrate with the
moving `edge` tag: pin `CRMEB_IMAGE` in `deployment/deployment.env` to the tested
`sha-<commit>` digest first, so the one-off container and the restarted stack are the
same build. Record what is running before you replace it:

```sh
cd /home/ubuntu/apps/CRMEB
docker image inspect "$(docker inspect crmeb-php --format '{{.Image}}')" \
  --format '{{range .RepoDigests}}{{println .}}{{end}}'
```

During a maintenance window, run the scripted upgrade. It performs the same steps
as the manual runbook below and refuses to continue when a step cannot be proven:

```sh
cd /home/ubuntu/apps/CRMEB
# The candidate must be a fixed digest; a moving tag is refused.
bash deploy/production/upgrade.sh ghcr.io/xiangyumou/crmeb@sha256:<64-hex-digit-digest>
```

The default Compose entry point is the deployment root's `compose.yaml`.
The release deployment archive includes `deploy/production/upgrade.sh`.
Database access accepts the normalized production `USERNAME` / `PASSWORD` /
`DATABASE` variables, with the MySQL image's root/database variables as fallback.

What it does, in order:

1. records the running image digest (the rollback target) and refuses to continue
   if the application roles are running different images;
2. stops every writing role — no migration runs against live writers;
3. dumps the database with `mysqldump --single-transaction` and checks the result
   is non-empty and a complete gzip stream;
4. restores that dump into an isolated MySQL (no network) and compares the
   retained order, refund, coupon and user row counts and content hashes against the live database,
   so an unusable backup is caught before anything is migrated;
5. runs `drop-retired.php plan`, then `apply`, then the idempotent
   `order-reliability.php apply`. The retired-feature JSON backup is written to
   `data/backups/retired-<timestamp>-<pid>/backup.json` (or beneath `CRMEB_BACKUP_DIR`),
   mounted as `/backups` in the migration container and recorded in the upgrade
   manifest. Keep this JSON together with the full SQL dump. The three new
   reliability tables may be absent from both the live and restored legacy
   databases; a one-sided absence or a missing core business table aborts;
6. starts the stack again and waits for every role to become healthy.

Any failure leaves the stack stopped and prints `UPGRADE FAILED`: no traffic
resumes automatically. Fix the cause and re-run, or restore from the backup the
script reported. `--dry-run` prints the plan without touching the stack, and
`--skip-migration` performs the backup and verification only.

The manual steps, for reference:

```sh
cd /home/ubuntu/apps/CRMEB
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
compose() { docker compose --env-file deployment/deployment.env "$@"; }
migrate() { compose run --rm --no-deps --entrypoint php "$@"; }
mkdir -p deployment/retired-backups

# 1. stop the writers; keep MySQL and Redis running
compose stop nginx php queue timer workerman

# 2. back up the database and the deployment settings before anything changes
docker exec crmeb-mysql sh -ec 'MYSQL_PWD="$PASSWORD" mysqldump --no-tablespaces -h127.0.0.1 -u"$USERNAME" --single-transaction --routines --events --triggers --set-gtid-purged=OFF "$DATABASE"' | gzip > "data/backups/pre-migration-$stamp.sql.gz"
gzip -t "data/backups/pre-migration-$stamp.sql.gz"
cp -p deployment/deployment.env "deployment/deployment.env.$stamp"

# 3. plan is read-only; it exits non-zero while settlement or a liability is pending
migrate -v "$PWD/deployment/retired-backups:/backups" php /var/www/crmeb/upgrade/core-store/drop-retired.php plan

# 4. remove the retired settings and rename the retired tables
migrate -v "$PWD/deployment/retired-backups:/backups" php /var/www/crmeb/upgrade/core-store/drop-retired.php apply "/backups/retired-$stamp.json"

# 5. add the order-reliability tables, refund columns and the exception-payment
#    table; it verifies column types, unique indexes and the retained row counts
migrate php /var/www/crmeb/upgrade/core-store/order-reliability.php apply

# 6. start the pinned image and wait for every role
compose up -d --wait --wait-timeout 180
compose ps
curl -fsS https://x-zoo.vip/readyz
```

`order-reliability.php apply` refuses to run while any payment attempt, in-flight
refund or unknown effect is unresolved (it prints the count and the
`php think order:reconcile` command that lists them), so the maintenance window
cannot start on top of an ambiguous money state.

`drop-retired.php apply` writes its backup before it changes anything and never
overwrites one, so each attempt needs a new path. `order-reliability.php apply` only
adds objects and is idempotent, so re-running it finishes a release that stopped
halfway. If the retired-feature step has to be undone, run `drop-retired.php rollback
/backups/retired-$stamp.json` with the same `/backups` mount and the same file:
it restores the settings rows and the table names. It does not undo the additive
step, which is safe to leave in place.

Accept the release with real purchases before restoring traffic: check `compose ps`,
`https://x-zoo.vip/readyz`, `/admin/`, the storefront, and the queue, timer and
workerman logs, then run the client and merchant acceptance in a staging copy or
behind the maintenance window. Promote the same digest to `edge` only after that
passes. The renamed `eb_retired_*` tables stay as they are: `finalize` is a separate
operation and is not part of this release.

The `## First migration` section above is the one-time deployment-directory
normalization. On a host that has already run it, `normalize.sh` prints `Already
migrated; no services changed` and the schema steps above are what a schema-changing
release needs.

## Channel settings after the container split

`crmeb/config/workerman.php` now reads its listen address, dial address and port from the settings file, so the PHP, queue, timer and workerman containers have to agree on them. Set them in `deployment/config/.env`:

```ini
[CHANNEL]
LISTEN_IP = 0.0.0.0
CLIENT_IP = workerman
PORT = 40003
```

`LISTEN_IP` is the interface the Workerman container binds; `CLIENT_IP` is the address the other roles dial. After the containers are split, leaving `CLIENT_IP` at its `127.0.0.1` default makes each role connect to itself: the site responds normally while new-order popups and customer-service messages never arrive. The port is deliberately not published to the host, so only services on `server-internal-net` can reach it. If the workerman healthcheck starts failing after a topology change, check this value first.

## Rollback

Record the previous immutable `sha-<40-character commit>` tag or the `backendImageDigest` in the matching `crmeb-release:sha-<full commit>` package before an update. To pin a known-good image:

```sh
bash deploy/production/rollback.sh ghcr.io/xiangyumou/crmeb@sha256:<64-hex-digit-digest>
```

Before it pulls anything, the script inspects the application containers and reads the `ghcr.io/xiangyumou/crmeb@sha256:` digest of the image they are actually running. That digest — not the `edge` tag string — is the recovery target, because `edge` moves and restoring the string would start whatever `edge` points to at that moment. It refuses to continue when a role has no recorded digest or when the roles disagree, and it will not change the deployment for a recovery target that is not available locally. Keep the previous image on the host until acceptance is finished.

After fixing the issue, resume tracking the tested master release with `bash deploy/production/rollback.sh --edge`. The script checks the new containers and restores the captured digest if their health check fails. Database changes are never rolled back by replacing containers; restore data only using a separately verified database recovery procedure. Image rollback and database recovery are separate operations and the script reports them separately.

The retired `migrate-all-in-one.sh` intentionally exits without changing services. Do not repeat a migration or run `docker compose down -v` in production.
