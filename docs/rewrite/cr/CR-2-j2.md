# CR-2-j2 — the OPS and REL invariant rows, mapped

**Status (R5 sweep, 2026-09-23): RESOLVED** — every OPS/REL row in `invariants.md` is mapped (ported or retired); `pnpm guards invariants` passes. The status line below is kept as history.

**Stream** J2 (container images and deployment) · **Against**
`docs/rewrite/invariants.md` (orchestrator-owned), three sections owned by J:
"Backup, upgrade and rollback", "Deployment topology", "Release publishing" ·
**Status** open · **Blocking** stream K's build, which fails while any row is
`unmapped`

## What

Eighteen rows across three sections are `unmapped`. Seven of them describe a
stack that no longer exists (maintenance mode, a Workerman Channel server, four
PHP roles in one image), so they cannot be ported literally — but each one
protects something that still matters, and the successor is what this CR names.

The evidence is `deploy/next/rehearsal/drill.sh`: a re-runnable drill that
builds the three images, publishes them to a registry it starts, and then
deploys, fails and rolls back a real stack. Case ids are stable, so a row can
cite `deploy/next/rehearsal/drill.sh::<case>` the way a unit row cites a test
name. `drill.sh --list` prints them; CR-3-j2 runs it in CI.

## Proposed change — replace three tables verbatim

### Backup, upgrade and rollback

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| OPS-005 | `upgrade.sh` refuses a moving tag, records the running digest as the rollback target, and refuses a deployment whose roles run different images. **Adapted:** the last clause has no literal successor — the old stack ran `php`, `queue`, `timer` and `workerman` from *one* image, so roles on different images meant a half-finished deploy. Here `web`, `worker` and `edge` are three different images by construction, so the successor rule is the one with the same purpose: a release must name all three candidates, and each service is verified to be running its own afterwards. | `deploy/next/rehearsal/drill.sh::upgrade/refuses-moving-tag`, `deploy/next/rehearsal/drill.sh::upgrade/requires-all-three-candidates`, `deploy/next/rehearsal/drill.sh::upgrade/deploys-and-records-rollback-target` | ported |
| OPS-006 | A dry run reports the plan without stopping writers or taking a backup. | `deploy/next/rehearsal/drill.sh::upgrade/dry-run-changes-nothing` | ported |
| OPS-007 | A failing migration keeps maintenance mode and resumes no traffic; the backup stays intact. **Adapted:** there is no maintenance mode. The new migrations are additive, so the previous image tolerates the new schema, and an unattended failure ends better on a stack that serves than on a stack that is down — the release returns to the previous digests, says in as many words that the schema had already moved, and names the verified dump it will not restore for you. | `deploy/next/rehearsal/drill.sh::upgrade/failed-migration-ends-on-previous`, `deploy/next/rehearsal/drill.sh::upgrade/unhealthy-worker-ends-on-previous` | ported |
| OPS-008 | A truncated backup is diagnosed before any migration and keeps the stack stopped. **Adapted:** "keeps the stack stopped" was maintenance mode again; the successor is that the upgrade aborts before the first migration with the previous images still pinned and running. | `deploy/next/rehearsal/drill.sh::backup/refuses-truncated-dump` | ported |
| OPS-009 | A backup that cannot be restored (contents disagree with the live database) stops the upgrade before any migration. | `deploy/next/rehearsal/drill.sh::backup/refuses-tampered-dump` | ported |
| OPS-010 | A valid upgrade dumps, verifies the dump by restoring it into an isolated database and comparing retained row counts, runs the migrations, resumes traffic and reports the rollback target. | `deploy/next/rehearsal/drill.sh::backup/verifies-restore`, `deploy/next/rehearsal/drill.sh::upgrade/deploys-and-records-rollback-target` | ported |
| OPS-011 | `rollback.sh` refuses an unavailable target instead of changing the deployment, and never claims a database was restored. | `deploy/next/rehearsal/drill.sh::rollback/refuses-unavailable-target`, `deploy/next/rehearsal/drill.sh::rollback/last-upgrade-returns-previous` | ported |
| OPS-012 | **New (J2).** Every long-running service declares a memory limit, the limits together stay under the 1.6 GB the host can spare, and every service that runs node carries an explicit `--max-old-space-size` — V8 sizes its heap from the *host's* memory, not the cgroup's, so a container without one is OOM killed with no diagnostic. | `deploy/next/rehearsal/drill.sh::static/memory-budget` | ported |
| OPS-013 | **New (J2).** No tracked file under `deploy/next/` or `next/docker/` carries a credential, and `deployment.env` — the one file that does — is gitignored. | `deploy/next/rehearsal/drill.sh::static/no-secrets-in-repo` | ported |

### Deployment topology

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| OPS-001 | The workerman health probe completes its Channel round trip through the address the configuration names: an empty `CLIENT_IP` is refused and there is no 127.0.0.1 fallback, so a bad address fails instead of passing inside its own container. **Retired:** there is no Workerman and no Channel server. Admin push is server-sent events from the `web` container over Redis pub/sub (stream E2), which is the same process that serves the request — there is no second daemon holding an address that can be wrong. The protection this row bought is covered by OPS-002's successor: a probe must prove a round trip, not merely that a process is up. | — | retired |
| OPS-002 | The queue and timer roles verify the Channel address they are configured with, not only a fresh heartbeat; stopping the Channel server turns them unhealthy. **Adapted:** queue, timer and workerman are one `worker`. Its probe (`next/docker/healthcheck/worker.mjs`) reads `worker:heartbeat` over the container's configured `REDIS_URL` and requires it to be **recent** — the key is refreshed from the same event loop that runs the jobs and is deleted before draining on SIGTERM, so a worker that is up and consuming nothing turns unhealthy, which is the failure the original row was about. **Partly open:** the probe shares the worker's own `REDIS_URL`, so a worker pointed at the *wrong* Redis would still find its own heartbeat there. That gap is narrower than the original — one Redis, one URL, in one env file that `upgrade.sh` checks is present before it stops a writer — but it is a gap, and closing it means the gate reading the heartbeat from a second vantage point. | `deploy/next/rehearsal/drill.sh::upgrade/unhealthy-worker-ends-on-previous` | ported |
| OPS-003 | `/readyz` gates on the tables, the refund columns and the unique indexes the release needs, and returns 503 (with no credentials or error detail) when any of them is missing; it recovers once the index is restored. **Adapted and partly open:** the gate half is done and is what a release is blocked on — `deploy/next/lib/readiness.sh` requires `drizzle.__drizzle_migrations` to be populated and every table in `NEXT_READINESS_TABLES` to exist, and an upgrade whose schema is short ends on the previous digests. The **HTTP** half is open: the edge's `/readyz` proxies to `/api/v1/health`, which is shallow, so nothing outside the host can ask "are you ready". CR-1-j2 proposes the route (503, `{code, message, details}`, no credentials); when it lands this row gains an app-side test and `readiness.sh` keeps its queries as the second opinion. | `deploy/next/rehearsal/drill.sh::upgrade/readiness-gate-ends-on-previous` | ported |
| OPS-004 | The production topology runs a probe for every role it starts (`php`, `queue`, `timer`, `workerman`), asserted by a static guard. **Adapted:** the roles are `postgres`, `redis`, `web`, `worker` and `edge`. The assertion is the same and is static — it parses the rendered Compose configuration and needs no running stack — but it lives in the drill rather than in `tests/static/`, because the thing it reads is a Compose file that only `docker compose config` can render faithfully (profiles, overrides, variable substitution). `migrate` is exempt: it is a one-shot that exits, and a healthcheck on it has nothing to report. | `deploy/next/rehearsal/drill.sh::static/healthcheck-per-service` | ported |

### Release publishing

These need no new code. `scripts/publish-release.sh` takes the image name as an
argument, so the three new images publish through the same tested path; CR-3-j2
is the YAML that calls it. The rows below therefore map to the tests that are
already green, and REL-006/007 additionally need the guard extended to the new
workflow — the exact assertions are in CR-3-j2 §5, and **these two rows should
not be marked `ported` until that lands**, because until then the rule is
enforced for one pipeline and not the other.

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| REL-001 | The first publish of a commit creates its commit-scoped tags and reports a digest. | `tests/deployment/publish-release.sh::a first publish creates sha-<sha>` | ported |
| REL-002 | Republishing the same commit reuses the same digest and is reported as a no-op. | `tests/deployment/publish-release.sh::republishing the same commit reuses the same digest` | ported |
| REL-003 | A candidate whose content differs from an existing tag fails the publish and names the digest it found, instead of silently republishing. | `tests/deployment/publish-release.sh::a conflicting candidate fails the publish instead of silently republishing` | ported |
| REL-004 | A registry query that cannot tell whether a tag exists aborts instead of being read as "absent". | `tests/deployment/publish-release.sh::an unanswerable registry query aborts instead of guessing` | ported |
| REL-005 | Promotion refuses a candidate that was never published and a candidate from another commit, and moves the deployment tag only to the verified digest. **Note:** the new stack has no moving deployment tag — `deployment.env` holds digests and `upgrade.sh` refuses a tag — so `promote` stays a legacy-only mode. The row is ported as it stands; CR-3-j2 §"does not do" says why no promotion step is added for `crmeb-next`. | `tests/deployment/publish-release.sh::promotion refuses a candidate that is not published at all`, `tests/deployment/publish-release.sh::promotion moves edge to the verified candidate digest`, `tests/deployment/publish-release.sh::promotion refuses a candidate from another commit` | ported |
| REL-006 | A static guard keeps the workflows calling the tested script (no inline publish helpers), keeps automated publishing from moving the deployment tag, requires the manual promotion inputs (digest, source SHA, acceptance record) and forbids the promotion workflow from rebuilding or pushing an image. **Extend to `next.yml`:** CR-3-j2 §5. | `tests/static/release-pipeline-guard.cjs` | unmapped until CR-3-j2 |
| REL-007 | Releases are serialized repository-wide and never cancelled mid-publish. **Extend to `next.yml`:** the merge-gate jobs cancel in progress, which is right, so the image job declares its own `next-images-${{ github.repository }}` group with `cancel-in-progress: false`. | `tests/static/release-pipeline-guard.cjs` | unmapped until CR-3-j2 |

## Two judgement calls the orchestrator should check

1. **OPS-007's automatic rollback.** The old script stopped and stayed stopped;
   this one returns to the previous images unattended. That is only safe while
   migrations are additive — `0000_init` plus whatever drizzle adds — because
   the previous image has to tolerate the new schema. If a destructive
   migration is ever written, this invariant's successor has to change with it,
   and the script says so at the point where it matters rather than only here.
2. **OPS-004's home.** If stream K's guard package ends up able to render a
   Compose file, this assertion belongs there as a real static guard and the
   drill case becomes redundant. It is in the drill today because that is the
   only place that can run `docker compose config`.

## Workaround in place

None is possible: `invariants.md` is orchestrator-owned and a row's State is
what stream K's build reads. The drill and its case ids exist and pass on this
machine (`docs/rewrite/status/j2.md` has the transcript), so applying this CR is
a paste, not an implementation.
