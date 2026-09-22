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
by one file — `compose.traefik.yml` — which is not applied until step 7.

Budget the host: 2 cores, 3.6 GB. The old stack is running the whole time and
the new one is capped at 1568 MiB, so the two together fit with room for the
one-shot `migrate` (384 MiB, which runs while the new `web` and `worker` are
stopped) and for the ETL.

---

## Before the window

1. **Have a release.** CI has built and published `crmeb-next-web`,
   `crmeb-next-worker` and `crmeb-next-edge` for the commit being released, and
   the three digests are written down. A tag is not a release: `upgrade.sh`
   refuses one.

2. **Configure the deployment.** On the host, in `/home/ubuntu/apps/CRMEB-next`:

   ```sh
   cp deploy/next/deployment.env.example deployment.env
   chmod 600 deployment.env
   # fill in: the three image digests, two generated passwords, the matching
   # DATABASE_URL / REDIS_URL, APP_ORIGIN, NEXT_HOST
   ```

   `deployment.env` is the only file holding a credential. It is never
   committed and never passed on a command line.

3. **Back up the old stack.** The existing runbook, not this one:
   `deploy/production/upgrade.sh --skip-migration` takes and verifies a MySQL
   dump without changing anything. Keep it and the uploads directory.

4. **Rehearse, here, on this host.**

   ```sh
   deploy/next/rehearsal/drill.sh
   ```

   It builds the images, brings a throwaway copy of this stack up in its own
   Compose project on a free loopback port, and then deploys, fails and rolls
   back — including the two failures worth having seen before you are in a
   window for real: a migration that fails after the backup, and a worker that
   starts and does no work. It touches neither the old stack nor the new one.
   Budget half an hour and the memory it declares.

   Rehearse the ETL separately against a copy of the dump — that is stream J's
   runner, not this file.

---

## The window

### 5. Bring the new stack up, with no route to it

```sh
cd /home/ubuntu/apps/CRMEB-next
deploy/next/upgrade.sh --first-deploy \
  --app-version "$(git rev-parse HEAD)" \
  --web    ghcr.io/xiangyumou/crmeb-next-web@sha256:… \
  --worker ghcr.io/xiangyumou/crmeb-next-worker@sha256:… \
  --edge   ghcr.io/xiangyumou/crmeb-next-edge@sha256:…
```

This starts PostgreSQL and Redis, runs the migrations and the reference seed,
starts `web`, `worker` and `edge`, and passes the readiness gate — or it stops
and says which check failed. Nothing is published beyond `NEXT_EDGE_BIND`,
which is loopback, so the old stack still serves every visitor.

`--first-deploy` is only for this step. Every later release omits it and
therefore has a rollback target.

### 6. ETL, then verify

The runner belongs to stream J; this file only says where it goes in the order.
It needs the legacy MySQL, which is still running in the old stack.

```sh
pnpm --filter @shop/etl etl plan
pnpm --filter @shop/etl etl run
pnpm --filter @shop/etl etl verify
pnpm --filter @shop/etl etl assets --execute   # uploads → the new volume
```

Then smoke-test through loopback, before anyone can reach it:

```sh
deploy/next/readyz.sh
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/admin
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/api/v1/health
```

Log into `/admin`, place an order on the storefront, pay it through the
gateway, and refund it. Check a migrated product, a migrated DIY page and a
migrated image actually render. **Do not continue on a partial pass** — the old
stack is still serving, so there is no clock running.

### 7. Switch the router

Stop the old stack's application roles first, so nothing can write to MySQL
behind the switch. Its database and Redis stay up until step 9, because the ETL
may have to be re-run.

```sh
cd /home/ubuntu/apps/CRMEB
docker compose --env-file deployment/deployment.env stop nginx php queue timer workerman

cd /home/ubuntu/apps/CRMEB-next
docker compose --env-file deployment.env \
  -f deploy/next/compose.yml -f deploy/next/compose.traefik.yml up -d --wait
```

The second file is the whole switch. It adds the Traefik labels **and** puts
the edge on `server-internal-net`; without it the new stack carries no labels
and is not even on the network Traefik routes over, which is why bringing it up
in step 5 could not have taken traffic by accident.

Verify through the real domain:

```sh
curl -fsS https://<NEXT_HOST>/healthz
curl -fsS https://<NEXT_HOST>/readyz
curl -fsS -o /dev/null -w '%{http_code}\n' https://<NEXT_HOST>/admin
```

### 8. Watch

Stay for at least one full cycle of the repeatable jobs (the longest is the
order sweep). `docker compose logs -f worker web edge`, and `docker stats` to
confirm nothing is pressing against its memory cap.

---

## Rollback

**Within the window, for anything:**

```sh
# 1. take the route away from the new stack
cd /home/ubuntu/apps/CRMEB-next
docker compose --env-file deployment.env -f deploy/next/compose.yml up -d --wait
#    (no -f compose.traefik.yml: the labels and the network are gone again)

# 2. give it back to the old one
cd /home/ubuntu/apps/CRMEB
docker compose --env-file deployment/deployment.env up -d --wait
curl -fsS https://<NEXT_HOST>/readyz
```

That is the entire rollback. The old stack's MySQL was never stopped and never
written to by anything new, so it is exactly as it was before step 7. Nothing
in `crmeb-next` is deleted either — leave it running on loopback and debug it
there.

**After acceptance, for a bad release:** that is not a cutover rollback, it is
`deploy/next/rollback.sh --last-upgrade`.

## Afterwards

- The old stack stays **stopped, not deleted**, along with `data/mysql`,
  `data/uploads` and `data/runtime`, until acceptance is signed off.
- Retiring it — deleting `crmeb/`, `template/admin/`, `deploy/production/`, the
  root `Dockerfile` and `compose.yaml`, then the MySQL volume — is a separate
  PR, deliberately out of scope here (PLAN §6, and stream J's brief says so).
- `docker compose down -v` is never run against either project. `-v` deletes
  the volumes.
