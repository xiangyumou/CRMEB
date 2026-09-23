# `deploy/` — running the shop

The production stack is one Compose project, `crmeb-next`, on one host:

| Service    | What it is                                                                                 | Memory cap |
| ---------- | ------------------------------------------------------------------------------------------ | ---------- |
| `postgres` | PostgreSQL 17, the only database                                                           | 512 MiB    |
| `redis`    | Redis 7 with `noeviction` and AOF: admin sessions, the config cache and the BullMQ queue   | 160 MiB    |
| `web`      | the Next.js server: the admin at `/admin`, `/admin-api/*` and the storefront API `/api/v1` | 512 MiB    |
| `worker`   | the BullMQ worker: repeatable jobs, the post-commit effects dispatcher                     | 320 MiB    |
| `edge`     | nginx: the H5 storefront at `/`, a proxy to `web`, and `/uploads/`                         | 64 MiB     |
| `migrate`  | a one-shot (profile `migrate`) that applies the migrations and the reference seed          | 384 MiB    |

The images are built in CI and pinned by digest. A host needs Docker with Compose v2, `curl`,
and nothing else: no Node, no pnpm, no build toolchain.

## Files

| File                     | What it is                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `compose.yml`            | the stack. It publishes only the edge, and only on loopback.                       |
| `compose.traefik.yml`    | the overlay that puts the edge behind Traefik; `NEXT_COMPOSE_OVERLAYS` applies it. |
| `deployment.env.example` | the template for `deployment.env`, which is gitignored and holds the passwords.    |
| `upgrade.sh`             | deploys a release; if it does not come up, it ends on the previous images.         |
| `rollback.sh`            | returns to a known set of images; `--restore` recovers data, and only when asked.  |
| `backup.sh`              | dumps the database and proves the dump restorable; `--verify-only` checks one.     |
| `readyz.sh`              | runs the readiness gate on its own. Read-only.                                     |
| `lib/`                   | shared shell: the Compose wiring, digest capture, the readiness gate.              |
| `rehearsal/`             | the drill that deploys, breaks and rolls back a throwaway copy of this stack.      |

## Conventions

Run everything from the release directory on the host, the one that contains `deploy/`. On the
production host that is `/home/ubuntu/apps/CRMEB-next`.

`deployment.env` lives **next to the scripts**, in `deploy/`. `lib/common.sh` resolves it from its
own directory and refuses to run without it, so a copy in the wrong place fails at once.

Every script calls Compose the same way: the project `crmeb-next`, `compose.yml`, then every
overlay `NEXT_COMPOSE_OVERLAYS` lists, and `deployment.env`. So must you. On the production host,
which runs behind Traefik:

```sh
docker compose -p crmeb-next --project-directory deploy \
  -f deploy/compose.yml -f deploy/compose.traefik.yml --env-file deploy/deployment.env …
```

Never drop `-p crmeb-next`. Without it Compose names the project after the directory, which is a
_different_ project with different volumes: you would start a second, empty stack beside the real
one. Never drop an overlay the deployment runs with either: an `up` without `compose.traefik.yml`
recreates the edge off the router. Set an alias once per shell, naming the same files as
`NEXT_COMPOSE_OVERLAYS`:

```sh
alias shopc='docker compose -p crmeb-next --project-directory deploy -f deploy/compose.yml -f deploy/compose.traefik.yml --env-file deploy/deployment.env'
```

On a host with no overlay, leave out `-f deploy/compose.traefik.yml`.

## Configuration: `deployment.env`

Every key the stack reads. `deployment.env.example` carries the same list with placeholders.

| Key                                                      | Meaning                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_WEB_IMAGE`, `NEXT_WORKER_IMAGE`, `NEXT_EDGE_IMAGE` | the release, as `repo@sha256:<64 hex>`. `upgrade.sh` and `rollback.sh` rewrite these three; you only set them by hand once.       |
| `NEXT_POSTGRES_IMAGE`, `NEXT_REDIS_IMAGE`                | the upstream images, also pinned by digest. Change them only as a deliberate upgrade of their own.                                |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`      | the database role and name. Generate the password: `openssl rand -base64 24 \| tr -d /+=`.                                        |
| `REDIS_PASSWORD`                                         | generated the same way.                                                                                                           |
| `DATABASE_URL`, `REDIS_URL`                              | the same credentials spelled as URLs, with hosts `postgres` and `redis`. The application reads only these.                        |
| `APP_ORIGIN`                                             | the origin the **browser** sees, e.g. `https://x-zoo.vip`. It drives the CSRF `Origin` check.                                     |
| `EXTRA_ALLOWED_ORIGINS`                                  | further origins allowed to send cookie-authenticated mutations, comma-separated. Usually empty.                                   |
| `APP_VERSION`                                            | the commit being served, reported by `/api/v1/health`. `upgrade.sh --app-version` sets it.                                        |
| `LOG_LEVEL`                                              | pino level for `web` and `worker`; `info` by default.                                                                             |
| `QUEUE_NAME`                                             | the BullMQ queue name; `shop`.                                                                                                    |
| `WORKER_CONCURRENCY`                                     | jobs one worker process runs at once; `4`.                                                                                        |
| `WEB_DB_POOL_MAX`, `WORKER_DB_POOL_MAX`                  | connection pool sizes; `10` and `5`. Together they must stay under PostgreSQL's `max_connections=40`.                             |
| `DB_POOL_ACQUIRE_TIMEOUT_MS`                             | how long a caller waits for a pooled connection before it errors instead of hanging; `5000`, `0` waits for ever.                  |
| `DB_IDLE_IN_TX_TIMEOUT_MS`                               | how long a session may sit idle inside an open transaction before PostgreSQL ends it and releases its locks; `30000`, `0` is off. |
| `HEARTBEAT_INTERVAL_MS`                                  | how often the worker refreshes `worker:heartbeat`. `web` reads the same value to judge whether the heartbeat is fresh.            |
| `NEXT_EDGE_BIND`                                         | where the edge publishes; `127.0.0.1:8080`. Keep it on loopback: Traefik reaches the edge over its own network.                   |
| `NEXT_HOST`                                              | the domain Traefik routes to the edge. Read only by `compose.traefik.yml`.                                                        |
| `NEXT_EDGE_TRUSTED_PROXIES`                              | the CIDRs whose `X-Forwarded-For` the edge believes: Traefik's network. Required by `compose.traefik.yml`; see below.             |
| `NEXT_COMPOSE_OVERLAYS`                                  | the Compose files every script layers over `compose.yml`, relative to `deploy/`. Behind Traefik: `compose.traefik.yml`.           |
| `NEXT_BACKUP_DIR`                                        | where dumps, upgrade manifests and settings backups go; `./data/backups`, relative to `deploy/`. Created mode 700.                |

`APP_ORIGIN` produces the most confusing failure in this list when it is wrong: every admin read
works and every admin _mutation_ returns 403.

Everything else the shop can be configured with (payment, SMS, storage, WeChat, logistics, the
site itself) is not an environment variable. It is typed configuration in the database, edited
under 设置 › 系统设置 in the admin.

The scripts check the file before they touch anything: it must exist, carry the image and URL
keys, be mode 600, and contain no `CHANGE-ME` placeholder. `deploy/readyz.sh` is the quickest way
to run that check: on a host with nothing running it fails at the first readiness check, which
proves it got past the settings.

## Putting a release on the host

A release is a commit that CI's `images` job has built. That job publishes
`crmeb-next-web`, `crmeb-next-worker` and `crmeb-next-edge` under `ghcr.io/xiangyumou/` and prints
the exact `upgrade.sh` command, with the three digests, in its job summary. It also prints
`storefront in the edge image: **real**`. If it says `placeholder` instead, the H5 build failed on
that commit and the image serves a placeholder page at `/`; do not deploy it.

The host needs only the `deploy/` directory of that commit. Copy it as an archive, which leaves
`deployment.env` and `data/` alone because neither is tracked:

```sh
# on a machine with the repository
git archive --format=tar.gz -o release.tar.gz <commit> deploy
scp release.tar.gz <host>:/tmp/

# on the host
cd /home/ubuntu/apps/CRMEB-next
tar -xzf /tmp/release.tar.gz
echo <commit> > REVISION
```

Then run `upgrade.sh` from that directory with the digests from the job summary.

A tag is not a release. `upgrade.sh` refuses anything that is not `repo@sha256:<64 hex>`: a tag
can be repointed between the run that passed and the deploy, and then the build that passed can
no longer be named. A rollback target has to be nameable.

## First deploy on a new host

1. **Check the host has room.** At least 1.8 GB of memory free and 5 GB of disk:

   ```sh
   free -m; df -h /var/lib/docker
   ```

2. **Put the release on the host** as above.

3. **Configure it.**

   ```sh
   cp deploy/deployment.env.example deploy/deployment.env
   chmod 600 deploy/deployment.env
   ```

   Fill in the image digests, the two generated passwords (in both places each appears),
   `APP_ORIGIN` and `NEXT_HOST`.

4. **Find Traefik's network.** The overlay joins the external network `server-internal-net`, which
   Traefik owns; it does not create it.

   ```sh
   docker network inspect server-internal-net \
     --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}'
   ```

   Put exactly that subnet (for example `172.18.0.0/16`) in `NEXT_EDGE_TRUSTED_PROXIES`.

5. **Bring the stack up**, with no route to it yet:

   ```sh
   deploy/upgrade.sh --first-deploy --app-version <commit> \
     --web    ghcr.io/xiangyumou/crmeb-next-web@sha256:… \
     --worker ghcr.io/xiangyumou/crmeb-next-worker@sha256:… \
     --edge   ghcr.io/xiangyumou/crmeb-next-edge@sha256:…
   ```

   It ends with `readiness gate: passed`, `upgrade complete` and `rollback target: <none>`. That
   `<none>` is correct here and only here: `--first-deploy` is the one run with nothing to go back
   to, and a failure leaves the stack down, which is harmless because nothing routes to it.

6. **Create the first super admin.** Nothing creates one on its own: the seed loads only
   reference data, and the admin cannot grant `is_super`. Generate a bcrypt hash from a checkout
   of the repository (the password is read from the terminal, not from the command line):

   ```sh
   cd packages/core
   read -rs PW && export PW
   node --input-type=module -e "import b from 'bcryptjs'; console.log(await b.hash(process.env.PW, 10))"
   unset PW
   ```

   Then insert the account on the host:

   ```sh
   shopc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
   insert into admins (account, password_hash, name, is_super)
   values ('admin', '<the hash>', '超级管理员', true);
   SQL
   ```

   Sign in at `/admin` and create every other account and role under 设置 › 管理员 and
   设置 › 身份管理.

7. **Smoke-test over loopback**, before anyone can reach it:

   ```sh
   deploy/readyz.sh
   curl -fsS http://127.0.0.1:8080/healthz
   curl -fsS http://127.0.0.1:8080/readyz; echo
   curl -fsS http://127.0.0.1:8080/api/v1/health; echo
   curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/admin
   ```

   Expected: `readiness gate: passed`; `ok`; `{"status":"ok",…,"checks":{"database":"ok","redis":"ok","migrations":"ok","worker":"ok"}}`;
   `{"status":"ok","time":"…","version":"<commit>"}`; `200`. Through an SSH tunnel
   (`ssh -L 8080:127.0.0.1:8080 <host>`), sign in to the admin and open a storefront page with an
   image on it.

8. **Put it behind Traefik**: set `NEXT_COMPOSE_OVERLAYS=compose.traefik.yml` and run an `up`
   (next section), then check through the domain:

   ```sh
   curl -fsS https://<NEXT_HOST>/healthz
   curl -fsS https://<NEXT_HOST>/readyz; echo
   curl -fsS -o /dev/null -w '%{http_code}\n' https://<NEXT_HOST>/admin
   ```

9. **Watch** one full cycle of the repeatable jobs: `shopc logs -f worker web edge` and
   `docker stats --no-stream`. Expect no restarts and every container under its cap. An OOM kill
   shows up as a climbing restart count in `shopc ps`, not as an error in a log.

## The Traefik overlay

`compose.yml` carries no Traefik labels and no external network, so bringing the stack up can
never take the domain by accident. `compose.traefik.yml` adds both: the labels for `NEXT_HOST` on
the `web` and `websecure` entrypoints (certificate resolver `myresolver`), and the edge's second
network, `server-internal-net`.

The overlay is a setting of the deployment, not a step someone remembers. Name it in
`deployment.env`:

```sh
NEXT_COMPOSE_OVERLAYS=compose.traefik.yml
```

From then on `upgrade.sh`, `rollback.sh`, `backup.sh` and `readyz.sh` all call Compose with
`-f compose.yml -f compose.traefik.yml`, so an upgrade or a rollback recreates the edge with its
route, not without it. A script refuses to start when the key names a file that does not exist.
To apply it the first time, or after editing the key, run an `up` with the same files (the `shopc`
alias above):

```sh
shopc up -d --wait
```

Then check the edge is on both networks:

```sh
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$(shopc ps -q edge)"
```

Expected: `crmeb-next_default server-internal-net`. Run the same check after every upgrade and
rollback; the drill proves both keep the overlay, and this proves the host is configured to.

To take the site off the router, empty `NEXT_COMPOSE_OVERLAYS` and run the `up` without the overlay
(`-f deploy/compose.yml` alone); the stack keeps serving on loopback.

### The client's address

The edge is the one place that decides who is calling. It believes `X-Forwarded-For` only from
`NEXT_EDGE_TRUSTED_PROXIES`, takes the right-most address in it that is not Traefik's, and sends
the app that one address as both `X-Real-IP` and `X-Forwarded-For`, overwriting whatever the
client wrote. The app reads `X-Real-IP` only, and its port is never published, so every request
reaches it through the edge. The per-IP SMS budget, 访客数, `last_login_ip` and the audit log's IP
all rest on this.

Get the setting right. Too narrow, and every shopper arrives as Traefik's single address: the
per-IP SMS budget (50 codes a day by default) then locks the whole shop out of SMS sign-in within
the day. Too wide, and a caller can name its own address again; `0.0.0.0/0` is refused outright.
To check it, send a made-up header from outside and read what the edge logged:

```sh
curl -fsS -o /dev/null -H 'X-Forwarded-For: 198.51.100.77' 'https://<NEXT_HOST>/?ip-check'
shopc logs --since 1m edge | grep ip-check | tail -1
```

The line must start with **your** public address, not `198.51.100.77` and not an address inside
`NEXT_EDGE_TRUSTED_PROXIES`.

## Upgrade

```sh
deploy/upgrade.sh --app-version <commit> \
  --web    ghcr.io/xiangyumou/crmeb-next-web@sha256:… \
  --worker ghcr.io/xiangyumou/crmeb-next-worker@sha256:… \
  --edge   ghcr.io/xiangyumou/crmeb-next-edge@sha256:…
```

All three images, always. A release where `web` moved and `worker` did not is a web talking to a
worker built against a different contract.

In order, refusing to continue when a step cannot be proven, it:

1. checks all three candidates are digests and records the running images as the rollback target;
2. pulls the candidates **before** stopping anything;
3. stops `web`, `worker` and `edge`, so a migration never runs against live writers;
4. takes a dump with `backup.sh` and proves it restorable;
5. runs the migrations and the reference seed as the `migrate` one-shot;
6. starts the candidates and runs the readiness gate.

If anything from step 5 on fails, it puts the previous images back and says whether the schema had
already moved. The migrations are additive, so the previous images run on the new schema; CI
refuses a migration that is not. The script never restores data on its own.

| Exit | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| 0    | deployed                                                |
| 1    | failed, and the previous images are running again       |
| 2    | invoked wrongly                                         |
| 3    | failed, **and** the rollback failed: a person is needed |

`--dry-run` checks and pulls, then stops before touching anything. `--skip-migration` deploys
images only. Each run writes `data/backups/upgrade-<stamp>.manifest` with the previous and new
images, the dump, and the outcome.

It recreates the containers with `compose.yml` and every overlay in `NEXT_COMPOSE_OVERLAYS`, so the
edge stays behind Traefik. On a Traefik host, check the key is set before the first upgrade.

## Rollback

```sh
deploy/rollback.sh --last-upgrade      # the images the last upgrade replaced
deploy/rollback.sh --web …@sha256:… --worker …@sha256:… --edge …@sha256:…
```

It checks the target images exist (pulling them if needed) before it changes anything, switches,
and runs the readiness gate. If the target does not come up, it returns to what was running.

| Exit | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| 0    | rolled back                                                        |
| 1    | the target did not come up; the previously running images are back |
| 2    | invoked wrongly                                                    |
| 3    | a person is needed                                                 |

Replacing containers never changes data. Like `upgrade.sh`, it uses the overlays in
`NEXT_COMPOSE_OVERLAYS`, so the edge keeps its route.

## Backup and restore

`upgrade.sh` takes a verified dump before every migration. To take one at any other time:

```sh
deploy/backup.sh                               # into NEXT_BACKUP_DIR, then verify it
deploy/backup.sh --out /somewhere/shop.sql.gz
deploy/backup.sh --verify-only data/backups/pre-upgrade-<stamp>.sql.gz
```

Verification restores the dump into a throwaway PostgreSQL with no network and its data on tmpfs,
then compares every table's row count against the live database. It prints
`backup verified: <n> table(s) restored with matching row counts`. "The dump exists" and "the dump
is usable" are different claims; only the second is worth stopping for. `--no-verify` exists for a
scheduled dump on a host short of memory. Nothing here schedules backups; add a cron entry if you
want them, and copy dumps off the host.

To restore a dump over the live database:

```sh
deploy/rollback.sh --last-upgrade --restore data/backups/pre-upgrade-<stamp>.sql.gz
```

`--restore` is never implied. It stops the writers, takes a safety dump of what it is about to
overwrite, asks you to type `restore` (or takes `--yes`), restores, and runs the readiness gate.
Every row written since the dump is gone.

**Uploads are not in the dump.** They live in the volume `crmeb-next_uploads`. Back them up
separately:

```sh
docker run --rm -v crmeb-next_uploads:/data:ro -v "$PWD":/out alpine \
  tar -czf /out/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

When you restore files into the volume by hand, make them readable afterwards:

```sh
docker run --rm -v crmeb-next_uploads:/data alpine chmod -R a+rX /data
```

The edge serves uploads as nginx's unprivileged user. A directory left at `0700` by whatever wrote
it turns every image under it into a 404, with `(13: Permission denied)` in the edge log. `a+rX`
sets `+x` on directories only, so no uploaded file becomes executable.

## Health and readiness

- `/healthz` is nginx answering for itself. It never depends on the app, so a slow app cannot
  take the edge's own probe down with it.
- `/api/v1/health` is the app answering, shallowly. It carries the version and no dependency
  detail.
- `/readyz` is proxied to the app's `/api/v1/readyz`, the deep check: database, Redis, migrations
  and worker heartbeat. It answers 503 naming the check that failed, and nothing else: no error
  text, no host, no connection string. The detail is in `shopc logs web`.

The container healthchecks use only the shallow probes. A container probe that opens a database
connection restarts the container whenever the database blips, which turns a degradation into an
outage. Nothing restarts a container on `/readyz`; an uptime monitor reads it, and so does the
**readiness gate** (`readyz.sh`, `lib/readiness.sh`) that ends every upgrade and rollback: every
container healthy, both HTTP probes answering through the published port, the migrations applied
with the tables the release needs, and a fresh `worker:heartbeat`.

The worker has no HTTP surface, so its probe reads `worker:heartbeat` and requires it to be
**recent**. The key is refreshed from the same event loop that runs the jobs and dropped before
draining on SIGTERM, so a wedged worker turns unhealthy, not merely a dead one.

## Where uploads are served from

With the local storage driver, the edge serves uploads under `/uploads/`: the **same origin** as
the admin and the API. That is a decision:

- a second hostname for uploads needs its own DNS, certificate and ICP filing;
- the uploader refuses HTML, SVG, XML, scripts and executables by content, not by name, and stores
  the sniffed type;
- the edge serves every upload with `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`, and `Content-Disposition: attachment` for
  everything but images and video. A file that did slip through downloads, or renders with no
  script and no origin, instead of running beside an admin session.

Revisit it the day either of the first two stops holding, and in particular before any change that
lets SVG or HTML in. With the S3 driver the same rule applies to `s3PublicBaseUrl`: point it at a
bucket or CDN hostname, never at this site's own origin, and give that host the same three headers.

## Memory

The host has 2 cores and 3.6 GB. The five long-running services are capped at 1568 MiB in total.
`migrate` (384 MiB) runs only while `web` and `worker` are stopped, so it reuses their 832 MiB
rather than adding to the total. Each JavaScript service also sets `--max-old-space-size`, because
V8 sizes its heap from the _host's_ memory and would otherwise be OOM-killed with no diagnostic.

## Behaviour an admin may ask about

- **售后设置** (the return address) needs the `refund:config:write` permission. A super admin
  holds every permission; a narrower role must be granted it.
- **店员 approving or rejecting a refund** is off until 允许店员审核售后 is turned on (店员与订单提醒 ›
  店员). List, detail and 备注 work without it.
- **网址导入** accepts `https://` sources only, unless 允许 http 地址导入 is turned on (存储设置 ›
  网址导入). Private, loopback and cloud-metadata addresses are always refused.
- **操作日志** lists every admin sign-in, successful or not, and every 店员 write, as well as admin
  writes.
- **浏览量** is folded into `products.views` once a minute by the worker, from a watermark kept in
  Redis. If Redis loses the watermark, the next run starts from the newest view, and the views in
  between are not added to the displayed counter; the view events the reports read are untouched.

## The drill

```sh
deploy/rehearsal/drill.sh                    # every case; about 25 minutes
deploy/rehearsal/drill.sh --list             # the case ids
deploy/rehearsal/drill.sh --only rollback --keep
```

It builds the three images from the checkout, pushes them to a registry container it starts, and
then deploys, breaks and rolls back a real stack: a moving tag, a missing candidate, a dry run, a
tampered and a truncated dump, a failing migration, a worker that starts and does no work, a
readiness gate that finds a table missing, a rollback to an image that is not there, a successful
upgrade and rollback, and the same upgrade and rollback with an overlay configured (a stand-in
for `compose.traefik.yml` on a stand-in network, never the real one). It uses its own Compose
project (`crmeb-next-drill`), its own generated passwords under `$TMPDIR` and its own free loopback
port, so it can run beside the live stack. It needs the whole repository, not just `deploy/`. CI
runs it on every change to the application or to this directory.

## Rules

- Every image is pinned by digest. `upgrade.sh` refuses a moving tag.
- No credential reaches a command line. Each is expanded by the shell inside the container that
  needs it, from that container's own environment.
- `docker compose down -v` deletes the volumes. It is never run against `crmeb-next`.
- Images are built in CI, not on the host: a 2-core box cannot spare the cores and does not need
  a toolchain.
