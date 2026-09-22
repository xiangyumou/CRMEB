# `deploy/next` — the rewritten stack

The Compose project `crmeb-next`: PostgreSQL 17, Redis 7, the Next server, the
BullMQ worker and an nginx edge. `deploy/production/` next door is the old PHP
stack; both run side by side through the cutover and the old one is stopped,
never deleted.

| File                     | What it is                                                       |
| ------------------------ | ---------------------------------------------------------------- |
| `compose.yml`            | the stack. Publishes to loopback; no route from the outside.      |
| `compose.traefik.yml`    | the overlay that takes traffic. One deliberate step, never a default. |
| `deployment.env.example` | the template for `deployment.env` (gitignored; holds the passwords). |
| `upgrade.sh`             | deploy a release, and end on the previous digests if it does not come up. |
| `rollback.sh`            | go back to a known set of digests; `--restore` for data, only when asked. |
| `backup.sh`              | dump, and prove the dump restorable. `--verify-only` checks an existing one. |
| `readyz.sh`              | run the readiness gate on its own; read-only.                     |
| `cutover.md`             | the one-time switch from the old stack (PLAN §6).                 |
| `lib/`                   | shared shell: compose wiring, digest capture, the readiness gate.  |
| `rehearsal/drill.sh`     | the drill: builds, deploys, breaks and rolls back a throwaway copy of this stack. |

## First time on a host

```sh
cp deployment.env.example deployment.env && chmod 600 deployment.env
# fill in the three image digests, two generated passwords, the matching URLs,
# APP_ORIGIN and NEXT_HOST
./upgrade.sh --first-deploy --web …@sha256:… --worker …@sha256:… --edge …@sha256:…
```

## A release

```sh
./upgrade.sh --app-version "$(git rev-parse HEAD)" \
  --web ghcr.io/…/crmeb-next-web@sha256:… \
  --worker ghcr.io/…/crmeb-next-worker@sha256:… \
  --edge ghcr.io/…/crmeb-next-edge@sha256:…
```

All three, always. A release where `web` moved and `worker` did not is a web
talking to a worker built against a different contract.

It pulls before it stops a writer, takes and verifies a dump, migrates with the
writers down, starts the candidates and runs the readiness gate — and if
anything after the migration fails, it puts the previous digests back and tells
you whether the schema had already moved. Exit 1 means "rolled back"; exit 3
means the rollback failed too and a human is needed.

`--dry-run` prints the plan and touches nothing. `--skip-migration` deploys
images only.

## Going back

```sh
./rollback.sh --last-upgrade                 # what the last upgrade replaced
./rollback.sh --web …@sha256:… --worker …@sha256:… --edge …@sha256:…
```

Replacing containers never changes data. `--restore <dump.sql.gz>` is the only
thing here that does: it is never implied, it takes a safety dump of what it is
about to overwrite, and it asks you to type the word `restore`.

## Health, readiness, and which is which

- `/healthz` — nginx answering for itself. Never depends on the app, so a slow
  app cannot take the edge's own probe down with it.
- `/readyz` — through the edge to the Next server. Both are shallow on purpose:
  a container probe that opens a PostgreSQL connection restarts the container
  when the database blips, which turns a degradation into an outage.
- the **readiness gate** (`readyz.sh`, `lib/readiness.sh`) — every container
  healthy, both HTTP probes, the migrations applied with the tables the release
  needs, and a fresh `worker:heartbeat`. It gates a *release*, where nothing
  will restart a container on its say-so.

The worker has no HTTP surface, so its probe reads `worker:heartbeat` and
requires it to be **recent**. The key is refreshed from the same event loop
that runs the jobs and dropped before draining on SIGTERM, so a wedged worker
turns unhealthy — not merely a dead one.

## Memory

The host is 2 cores / 3.6 GB and runs the old stack too. The five long-running
services are capped at 1568 MiB: postgres 512, redis 160, web 512, worker 320,
edge 64. `migrate` (384) is a one-shot that runs while `web` and `worker` are
stopped, so it reuses their 832 rather than adding to the total. Each
JavaScript service also carries an explicit `--max-old-space-size`, because V8
sizes its heap from the *host's* memory and would otherwise be OOM killed with
no diagnostic.

## Before you trust any of the above

```sh
rehearsal/drill.sh          # everything; ~25 minutes
rehearsal/drill.sh --list   # the case ids
rehearsal/drill.sh --only rollback --keep
```

It builds the three images, pushes them to a registry container it starts, and
then deploys, fails and rolls back a real stack: a moving tag, a missing
candidate, a dry run, a failing migration, a worker that starts and does no
work, a readiness gate that finds a table missing, a tampered dump, a rollback
to an image that is not there. Own Compose project, own generated passwords
under `$TMPDIR`, own free port — so it is safe to run on the production host
beside the live stack, which is the point of having it.

## Rules

- Every image is pinned by digest. `upgrade.sh` refuses a moving tag.
- No credential ever reaches a command line: each one is expanded by the shell
  inside the container that needs it.
- `docker compose down -v` deletes the volumes. It is never run here.
- Images are built in CI, not on the host: a 2-core box cannot spare the cores
  and does not need a toolchain.
