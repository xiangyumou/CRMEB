# Cutover: `crmeb-production` → `crmeb-next`

The one-time switch from the PHP stack to the rewritten one, following PLAN §6.
Afterwards, releases are `upgrade.sh` and this file is history.

Two facts shape every step below:

- **The site has no real data.** The production check found 1 user, 7 test
  orders, 2 products, 1 admin, 18.7 MB of database and 45 MB of uploads, and
  the domain is blocked at the cloud edge pending ICP. Orders are not migrated
  at all. So this is a short maintenance window, not a migration under load.
- **The old stack is stopped, never deleted.** Its containers, its MySQL volume
  and its uploads stay exactly where they are until acceptance is signed off.
  Rollback is switching the router back, which takes seconds and loses nothing.

Both stacks run side by side throughout. They are separate Compose projects
(`crmeb-production` and `crmeb-next`) with separate volumes and separate
databases; the only thing they contend for is the domain, and that is decided
by one file — `compose.traefik.yml` — which is not applied until step 15.

Budget the host: 2 cores, 3.6 GB. The old stack is running the whole time and
the new one is capped at 1568 MiB, so the two together fit with room for the
one-shot `migrate` (384 MiB, which runs while the new `web` and `worker` are
stopped) and for the ETL.

**How to read this file.** Every command is meant to be pasted as written, from
the working directory its section names, and every check says what a pass looks
like. Where output is quoted, that is what the script prints on success — if
you see something else, stop and read rather than re-run.

---

## 0. Conventions

| Thing               | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| Old checkout        | `/home/ubuntu/apps/CRMEB`                                 |
| Old Compose project | `crmeb-production`                                        |
| New checkout        | `/home/ubuntu/apps/CRMEB-next`                            |
| New Compose project | `crmeb-next`                                              |
| New settings file   | `/home/ubuntu/apps/CRMEB-next/deploy/next/deployment.env` |
| New backups         | `/home/ubuntu/apps/CRMEB-next/deploy/next/data/backups`   |
| Router network      | `server-internal-net` (external, owned by Traefik)        |

`deployment.env` lives **next to the scripts**, in `deploy/next/`, not at the
top of the checkout. `lib/common.sh` resolves it from its own directory and
refuses to run without it, so a copy in the wrong place fails immediately and
visibly rather than deploying something half-configured.

Every script here calls Compose the same way, and so must you:

```
docker compose -p crmeb-next --project-directory deploy/next \
  -f deploy/next/compose.yml --env-file deploy/next/deployment.env …
```

Including `-p crmeb-next`. Without the project flag Compose names the project
after the directory (`CRMEB-next`), which is a _different_ project with
different volumes: you would start a second, empty stack beside the real one
and wonder where the data went. Set this once per shell and the rest of the
file shortens:

```sh
cd /home/ubuntu/apps/CRMEB-next
alias nextc='docker compose -p crmeb-next --project-directory deploy/next -f deploy/next/compose.yml --env-file deploy/next/deployment.env'
```

---

## Part 1 — Before the window

Nothing in this part touches the running site. Do all of it on an ordinary
working day; a prerequisite discovered inside the window is a prerequisite that
costs downtime.

### 1. Have a release

CI's `images` job has built and published `crmeb-next-web`, `crmeb-next-worker`
and `crmeb-next-edge` for the commit being released, and printed the three
digests in its job summary. Copy them from there.

```sh
docker pull ghcr.io/xiangyumou/crmeb-next-web@sha256:…
docker pull ghcr.io/xiangyumou/crmeb-next-worker@sha256:…
docker pull ghcr.io/xiangyumou/crmeb-next-edge@sha256:…
```

Expected: three `Status: Downloaded newer image …` (or `Image is up to date`)
lines, exit 0.

A tag is not a release. `upgrade.sh` refuses anything that is not
`repo@sha256:<64 hex>`, because a tag can be repointed between the acceptance
run and the deploy — and then "the build that passed acceptance" is not
something you can name, which is the one thing a rollback target has to be.

**Check the edge image carries the real storefront**, not the placeholder. The
`images` job prints `storefront in the edge image: **real**` in its summary; if
it printed `placeholder`, the H5 build failed on that checkout and the job
raised a `::warning::`. Do not deploy that image to a site that serves
shoppers. Confirm on the image itself:

```sh
docker run --rm --entrypoint sh ghcr.io/xiangyumou/crmeb-next-edge@sha256:… \
  -c 'ls /srv/h5'
```

Expected: `index.html` plus the uni-app bundle's `static/` and its hashed asset
directories. A lone placeholder page is the failure.

### 2. Configure the deployment

```sh
cd /home/ubuntu/apps/CRMEB-next
cp deploy/next/deployment.env.example deploy/next/deployment.env
chmod 600 deploy/next/deployment.env
```

Then edit it:

| Key                                                      | What to put                                           |
| -------------------------------------------------------- | ----------------------------------------------------- |
| `NEXT_WEB_IMAGE`, `NEXT_WORKER_IMAGE`, `NEXT_EDGE_IMAGE` | the three digests from step 1                         |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`                    | fresh, generated — below                              |
| `DATABASE_URL`, `REDIS_URL`                              | the same two passwords, spelled into the URLs         |
| `APP_ORIGIN`                                             | `https://x-zoo.vip` — the origin the **browser** sees |
| `NEXT_HOST`                                              | the domain Traefik routes, normally the same host     |
| `NEXT_EDGE_BIND`                                         | leave at `127.0.0.1:8080`                             |
| `APP_VERSION`                                            | the commit being released                             |

```sh
openssl rand -base64 24 | tr -d /+=   # once per password
```

`APP_ORIGIN` is used for the CSRF `Origin` check, so a wrong value produces the
most confusing failure in this file: every admin read works and every admin
_mutation_ returns 403.

Prove the file is complete before the window, not during it:

```sh
deploy/next/readyz.sh
```

Expected **now**: it fails at the first check, because nothing is running —
that is fine. What you are proving is that it gets _past_ the settings check.
If instead it says `… still contains CHANGE-ME placeholders` or
`NEXT_WEB_IMAGE is missing from …`, fix that today.

### 3. Prove the router network exists

```sh
docker network inspect server-internal-net --format '{{.Name}} {{.Driver}}'
```

Expected: `server-internal-net bridge`. This network is external and owned by
Traefik; `compose.traefik.yml` joins it rather than creating it, so a missing
network fails the switch at step 15 — the one step with downtime running.

### 4. Check the host has room

```sh
free -m
df -h /var/lib/docker
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
```

Expected: at least 1.8 GB of memory free with the old stack running, and at
least 5 GB of disk. The new stack caps itself at 1568 MiB; the `migrate`
one-shot wants another 384 MiB and runs while `web` and `worker` are stopped,
so it does not stack on top of them.

### 5. Back up the old stack, and keep the backup

This is the existing runbook, not this one:

```sh
cd /home/ubuntu/apps/CRMEB
deploy/production/upgrade.sh --skip-migration
```

It takes and verifies a MySQL dump and changes nothing else. Note where it
wrote the dump. Then the uploads, and copy both off the host if you can:

```sh
tar -czf ~/crmeb-uploads-$(date +%Y%m%d).tar.gz -C "$CRMEB_DATA_DIR" uploads
sha256sum ~/crmeb-uploads-*.tar.gz
```

Expected: an archive of roughly 45 MB and its digest. Write the digest down.

### 6. Rehearse the deploy

```sh
cd /home/ubuntu/apps/CRMEB-next
deploy/next/rehearsal/drill.sh
```

It builds the three images, publishes them to a registry container it starts,
and then deploys, fails and rolls back a throwaway copy of this stack in its own
Compose project on a free loopback port — including the two failures worth
having seen before you are in a window for real: a migration that fails after
the backup, and a worker that starts and does no work. It touches neither the
old stack nor the new one.

Expected: `16 case(s) passed` and exit 0. Budget half an hour.

```sh
deploy/next/rehearsal/drill.sh --list   # what the sixteen cases are
```

### 7. Rehearse the ETL against a copy of the real dump

This is the step that finds the data problems, and it is the one most often
skipped, because it needs a copy of production data on a machine you are
allowed to put it on. **Get the go-ahead first** — a dump copy is data egress —
and never commit a dump, a hostname or a credential to this repository.

```sh
deploy/next/rehearsal/etl-drill.sh ~/crmeb-prod-copy.sql.gz \
  --uploads-root ~/crmeb-uploads-copy
```

It starts a MySQL 8 and a PostgreSQL 17 of its own, loads the dump, runs the
schema migration, `etl plan`, `etl run`, `etl verify --full-digest` and
`etl assets --execute`, then starts `web` and `edge` against the result and
fetches one product, one DIY page and one attachment over HTTP — the attachment
compared by sha256 against what the migration recorded, because nginx will
serve a zero-length file with a 200.

Expected at the end:

```
the migrated shop serves a product, a DIY page and an attachment.
```

and exit 0. Anything less is a data problem, and the window is not where you
want to find out what it is.

To prove the harness itself without any real data:

```sh
deploy/next/rehearsal/etl-drill.sh --self-test
```

### 8. Freeze

No admin writes on the old stack from here until the switch. There is one admin
and no shoppers, so this is an agreement rather than a mechanism.

---

## Part 2 — The window

From here the clock is running, but only in the sense that you should not
wander off: the old stack serves every visitor until step 15.

### 9. Note the start

```sh
date -Is; git -C /home/ubuntu/apps/CRMEB-next rev-parse HEAD
```

Write both down. They go in the acceptance record.

### 10. Bring the new stack up, with no route to it

```sh
cd /home/ubuntu/apps/CRMEB-next
deploy/next/upgrade.sh --first-deploy \
  --app-version "$(git rev-parse HEAD)" \
  --web    ghcr.io/xiangyumou/crmeb-next-web@sha256:… \
  --worker ghcr.io/xiangyumou/crmeb-next-worker@sha256:… \
  --edge   ghcr.io/xiangyumou/crmeb-next-edge@sha256:…
```

In order, refusing to continue when a step cannot be proven: it checks all
three candidates are digests, pulls them **before** stopping anything, starts
PostgreSQL and Redis, runs the migrations and the reference seed as a one-shot,
starts `web`, `worker` and `edge`, and runs the readiness gate.

Expected at the end:

```
readiness gate: passed
upgrade complete
  web:    ghcr.io/…/crmeb-next-web@sha256:…
  worker: ghcr.io/…/crmeb-next-worker@sha256:…
  edge:   ghcr.io/…/crmeb-next-edge@sha256:…
  rollback target: <none> / <none> / <none>
  manifest: …/deploy/next/data/backups/upgrade-<stamp>.manifest
```

`rollback target: <none>` is correct here and only here: `--first-deploy` is the
one run with nothing to go back to. Every later release omits the flag and
therefore records a target.

Exit codes: `0` deployed · `1` failed and rolled back to the previous images ·
`2` you invoked it wrongly · `3` it failed **and** the rollback failed, which
needs a person. On `--first-deploy` there is nothing to roll back to, so a
failure leaves the new stack down — harmless, because it has no route.

Nothing is published beyond `NEXT_EDGE_BIND`, which is loopback. Prove it:

```sh
nextc ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
```

Expected: `postgres`, `redis`, `web`, `worker` with no published ports at all,
and `edge` on `127.0.0.1:8080->80/tcp` and nothing else.

### 11. ETL: plan, run, verify

The ETL runs from this checkout, on the host, and has to reach two databases
that publish no ports: the **old** MySQL (still serving) and the **new**
PostgreSQL. Bridge both onto loopback for the length of the window, and take
the bridges down again at step 14.

```sh
legacy_net="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' \
  "$(docker compose -p crmeb-production ps -q mysql)")"
echo "$legacy_net"        # expected: crmeb-production_default

docker run -d --rm --name etl-bridge-mysql --network "$legacy_net" \
  -p 127.0.0.1:13306:3306 alpine/socat \
  tcp-listen:3306,fork,reuseaddr tcp-connect:mysql:3306

docker run -d --rm --name etl-bridge-pg --network crmeb-next_default \
  -p 127.0.0.1:15432:5432 alpine/socat \
  tcp-listen:5432,fork,reuseaddr tcp-connect:postgres:5432

docker ps --filter name=etl-bridge --format '{{.Names}} {{.Ports}}'
```

Expected from the last command: two lines, both bound on `127.0.0.1` only.
Nothing binds a public interface at any point, and both are `--rm`.

Both connection strings come from the **environment** and never from a command
line: argv is world-readable in `ps` and lands in shell history, and one of
these two strings is the credential for a database that is still serving live
traffic.

```sh
cd /home/ubuntu/apps/CRMEB-next/next
set +o history
export LEGACY_MYSQL_URL='mysql://<user>:<password>@127.0.0.1:13306/<db>'
export DATABASE_URL='postgres://shop:<the POSTGRES_PASSWORD you generated>@127.0.0.1:15432/shop'
set -o history
```

The legacy credentials are in the old stack's `deployment/deployment.env`. Read
them; do not guess them.

Count what is there before changing anything:

```sh
pnpm --filter @shop/etl etl plan
```

Expected: a table of source tables with row counts and the new tables each one
writes, exit 0. It is read-only.

Then the migration, and immediately the comparison:

```sh
pnpm --filter @shop/etl etl run --uploads-root "$CRMEB_DATA_DIR/uploads"
pnpm --filter @shop/etl etl verify --uploads-root "$CRMEB_DATA_DIR/uploads" --full-digest
```

Expected, the last line of `verify`:

```
18/18 项通过
```

Every check has to pass. `verify` compares row counts, money totals, the DIY
JSON round trip _as documents_ rather than as bytes, the attachment files and
their sha256, every foreign key's `VALIDATED` state, orphan rows, and every
sequence against `max(id)`. It also asserts the tables that are deliberately
**not** migrated are empty — orders, carts, payments, refunds.

`etl run` is idempotent: it truncates and reloads per group, one transaction
each, so a failed group can be fixed and the whole thing re-run. Give
`--migrated-at` the same ISO timestamp on a re-run if you want byte-identical
output.

`--require-complete` fails the run while any group's mapper has not landed. Use
it for the real cutover once every stream has merged; before that it will stop
on the groups PLAN §6 has not finished.

### 12. Copy the uploads, and make them readable

Look before you copy — without `--execute` this only writes the plan and the
manifest and prints the exact `rsync` it would run:

```sh
pnpm --filter @shop/etl etl assets \
  --uploads-root "$CRMEB_DATA_DIR/uploads" \
  --dest /var/lib/docker/volumes/crmeb-next_uploads/_data \
  --out ~/etl-out
```

Read that `rsync` line, then run it for real:

```sh
sudo -E pnpm --filter @shop/etl etl assets \
  --uploads-root "$CRMEB_DATA_DIR/uploads" \
  --dest /var/lib/docker/volumes/crmeb-next_uploads/_data \
  --out ~/etl-out --execute
```

Expected: `rsync 完成。…` and a file count matching the manifest.

It copies **exactly the files the database references**, from an rsync
`--files-from` list, not the whole tree. A ten-year-old uploads directory is
mostly orphaned thumbnails, and it is also where a webshell would live if the
shop ever had one; a file the new database does not reference cannot be reached
through the new shop anyway, and the old tree is kept until the rollback window
closes.

Now the permissions, which are easy to skip and produce a failure that reads
like something else entirely:

```sh
sudo chmod -R a+rX /var/lib/docker/volumes/crmeb-next_uploads/_data
```

`rsync -a` preserves the _legacy_ tree's modes, and that tree belongs to
whatever uid the old PHP-FPM pool ran as. The new edge serves those bytes as
nginx's unprivileged worker — a different user in a different container — so a
directory the old host left at `0700` makes every product image a **404**, with
`stat() … (13: Permission denied)` in the edge log. That reads as "the uploads
did not migrate", and it is not that at all. `a+rX` (capital X) sets `+x` on
directories only, so an uploaded `.png` does not come out executable. The ETL
drill hit this on its first run and now does the same thing for the same
reason.

Re-verify against the destination the stack will actually read:

```sh
pnpm --filter @shop/etl etl verify \
  --uploads-root /var/lib/docker/volumes/crmeb-next_uploads/_data --full-digest
```

Expected: `18/18 项通过` again, with the attachment check now re-hashing the
copied files. "rsync exited 0" and "every image the shop will ask for is there
and is the right bytes" are different claims, and only the second is worth
having.

### 13. Smoke-test through loopback, before anyone can reach it

```sh
cd /home/ubuntu/apps/CRMEB-next
deploy/next/readyz.sh
```

Expected:

```
readiness: /readyz reports every dependency ok
readiness: 1 migration(s) applied, required tables present
readiness gate: passed
```

Then the four endpoints by hand:

```sh
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz; echo
curl -fsS http://127.0.0.1:8080/api/v1/health; echo
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/admin
```

Expected, in order:

- `ok` — the edge itself is up. It never touches the database, on purpose: an
  edge whose health depends on PostgreSQL restarts itself whenever PostgreSQL
  blips, which turns a degradation into an outage.
- `{"status":"ok","time":"…","version":"<the commit>","checks":{"database":"ok","redis":"ok","migrations":"ok","worker":"ok"}}`
  — the deep probe. All four `ok`, or it is a 503 whose body names the one that
  is not. `worker: ok` means the worker wrote a heartbeat within its interval;
  a worker that starts and does no work is a failure this gate catches and a
  container healthcheck does not.
- `{"status":"ok","time":"…","version":"<the commit>"}` — shallow, and with no
  dependency detail in it.
- `200`.

A 503 from `/readyz` names the failing dependency and nothing else — no error
text, no hostname, no connection string. That is deliberate; the detail is in
`nextc logs web`.

Then drive it as a person. Open an SSH tunnel (`ssh -L 8080:127.0.0.1:8080 …`)
and, in a browser:

1. Log into `/admin` with the migrated admin account.
2. Open a migrated product, a migrated DIY page and a migrated image, and check
   they render — the image especially, because that is the permission trap in
   step 12.
3. Place an order on the storefront, pay it through the **fake** gateway, and
   refund it.
4. Check the worker did its part: `nextc logs --tail=50 worker`.

One command's worth of the same thing, if you want it scripted:

```sh
curl -fsS -H 'X-Client-Platform: h5' \
  http://127.0.0.1:8080/api/v1/catalog/products/1 | head -c 400; echo
```

**Do not continue on a partial pass.** The old stack is still serving every
visitor; there is no clock running that is worth a half-verified switch.

### 14. Close the ETL bridges

Before the domain moves, take the two loopback ports away — they exist for the
migration and for nothing else.

```sh
docker rm -f etl-bridge-mysql etl-bridge-pg
unset LEGACY_MYSQL_URL DATABASE_URL
docker ps --filter name=etl-bridge --format '{{.Names}}'
```

Expected: no output from the last command.

### 15. Switch the router

Stop the old stack's application roles first, so nothing can write to MySQL
behind the switch. Its database and Redis stay up until acceptance, because the
ETL may have to be re-run.

```sh
cd /home/ubuntu/apps/CRMEB
docker compose -p crmeb-production --env-file deployment/deployment.env \
  stop nginx php queue timer workerman
```

Expected: five `Stopped` lines. `mysql` and `redis` are deliberately not in the
list.

```sh
cd /home/ubuntu/apps/CRMEB-next
docker compose -p crmeb-next --project-directory deploy/next \
  -f deploy/next/compose.yml -f deploy/next/compose.traefik.yml \
  --env-file deploy/next/deployment.env up -d --wait
```

The second file is the whole switch. It adds the Traefik labels **and** puts the
edge on `server-internal-net`; without it the new stack carries no labels and is
not even on the network Traefik routes over — which is why bringing it up at
step 10 could not have taken the domain by accident.

Expected: `Container crmeb-next-edge-1  Healthy` and exit 0. Confirm the edge is
now on both networks:

```sh
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
  "$(nextc ps -q edge)"
```

Expected: `crmeb-next_default server-internal-net`.

### 16. Verify through the real domain

```sh
curl -fsS https://x-zoo.vip/healthz
curl -fsS https://x-zoo.vip/readyz; echo
curl -fsS -o /dev/null -w '%{http_code}\n' https://x-zoo.vip/admin
curl -fsS -o /dev/null -w '%{http_code}\n' https://x-zoo.vip/
```

Expected: `ok`, the four-`ok` readiness JSON, `200`, `200`. Then log into
`/admin` through the domain and load one storefront page that has an image on
it. If `/admin` reads fine but an admin _save_ returns 403, `APP_ORIGIN` does
not match the origin the browser sends — step 2.

### 17. Watch

Stay for at least one full cycle of the repeatable jobs (the longest is the
order sweep).

```sh
nextc logs -f worker web edge
docker stats --no-stream
```

Expected: no restarts, and every container comfortably under its cap. `web` and
`worker` are the ones to watch, and the project's total stays under 1568 MiB. A
container being OOM-killed shows as a climbing restart count in `nextc ps`, not
as an error in the log.

---

## Rollback

### Within the window, for anything at all

The route goes back to the old stack, and nothing is deleted.

```sh
# 1. take the route away from the new stack: the same command, without the overlay
cd /home/ubuntu/apps/CRMEB-next
docker compose -p crmeb-next --project-directory deploy/next \
  -f deploy/next/compose.yml --env-file deploy/next/deployment.env up -d --wait

# 2. give it back to the old one
cd /home/ubuntu/apps/CRMEB
docker compose -p crmeb-production --env-file deployment/deployment.env up -d --wait

# 3. prove it
curl -fsS -o /dev/null -w '%{http_code}\n' https://x-zoo.vip/
```

Expected: `200`, served by the old stack. Confirm the labels and the network
really are gone from the new edge:

```sh
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
  "$(nextc ps -q edge)"
```

Expected: `crmeb-next_default` alone.

That is the entire rollback. The old stack's MySQL was never stopped and never
written to by anything new, so it is exactly as it was before step 15. Nothing
in `crmeb-next` is deleted either — leave it running on loopback and debug it
there, with the migrated database intact and `deploy/next/readyz.sh` to hand.

Re-running the cutover afterwards is steps 10–16 again; `etl run` truncates and
reloads per group, so the second pass is not a special case.

### After acceptance, for a bad release

That is not a cutover rollback, it is an ordinary one:

```sh
deploy/next/rollback.sh --last-upgrade
```

Expected: `rolled back:` and the three previous references, then
`readiness gate: passed`. Exit `0` rolled back · `1` the target did not come up
and the previously running images were restored · `2` misuse · `3` needs a
person.

Replacing containers never changes database contents, and this script says so in
as many words. Data recovery is a separate, deliberate operation:

```sh
deploy/next/backup.sh --verify-only deploy/next/data/backups/pre-upgrade-<stamp>.sql.gz
deploy/next/rollback.sh --last-upgrade --restore deploy/next/data/backups/pre-upgrade-<stamp>.sql.gz
```

Expected from `--verify-only`:
`backup verified: <n> table(s) restored with matching row counts`. It restores
the dump into a throwaway PostgreSQL with no network at all and compares every
table's row count against the live database, because "the dump exists" and "the
dump is usable" are different claims and only the second is worth stopping for.

`--restore` is never implied, prints what it is about to overwrite, takes its
own safety dump first, and requires `--yes` to proceed unattended.

---

## Afterwards

- The old stack stays **stopped, not deleted**, along with `data/mysql`,
  `data/uploads` and `data/runtime`, until acceptance is signed off.
- `docker compose down -v` is never run against either project. `-v` deletes the
  volumes, and the old stack's volume is the only copy of the data the new one
  was built from.
- Keep the pre-cutover MySQL dump and the uploads archive from step 5 until the
  retirement PR merges.
- `NEXT_EDGE_BIND` stays on loopback. Traefik reaches the edge over
  `server-internal-net`, so nothing needs the published port once the domain is
  switched.

### The retirement PR

A separate PR, deliberately out of scope here (PLAN §6), raised after acceptance:

1. `crmeb/` — the PHP application.
2. `template/admin/` — the old Vue admin.
3. `deploy/production/` — the old stack's compose, nginx config and scripts.
4. The root `Dockerfile` and `compose.yaml`.
5. The legacy `tests/` that only exercise the PHP tree.
   `tests/regression/cases.md` and `tests/regression/risk-matrix.md` **stay**:
   they are the specification `docs/rewrite/invariants.md` maps, and deleting
   them deletes the thing the rewrite is measured against.
6. `.github/workflows/container.yml` and `promote.yml`, and the parts of
   `tests/static/release-pipeline-guard.cjs` that assert on them — the
   rewrite's half of that guard, the `next.yml` assertions, stays.
7. `scripts/build-uni.sh`'s admin path, if nothing else uses it.

Only then, and as its own step once that PR has been deployed and has lived for
a while, delete the MySQL volume and `data/runtime`. That deletion is the first
irreversible thing in this entire document.
