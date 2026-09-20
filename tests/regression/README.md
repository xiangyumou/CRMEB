# Core regression suite

Run the isolated PHP 7.4, MySQL 8 and Redis 5 suite from the repository root,
against an image built from the revision under test:

```sh
docker build --build-arg VCS_REF="$(git rev-parse HEAD)" -t crmeb-test .
sh docker/run-regression.sh crmeb-test
```

`docker/run-regression.sh` requires the image name and refuses to run unless its
`org.opencontainers.image.revision` label equals `git rev-parse HEAD`, so a stale
image cannot report on new code. `sh scripts/check-maintenance.sh crmeb-test`
wraps this suite plus the linter and the static guards.

The command creates disposable containers and volumes. It never uses the production environment or data directories. JUnit output is written to `tests/regression/artifacts/junit.xml`.

The suite covers the retained shop only: the balance, recharge, commission and member surfaces were deleted with the features that used them, and their test files went with them. `CoreStoreBoundaryTest` asserts those routes and parameters are refused. The Docker network is internal, so gateway, SMS, logistics, and WeChat services cannot reach the public internet during a run; payment transports are replaced by offline doubles.

A checked item in `cases.md` must have executable assertions for the response, persisted effects, and a no-side-effect failure or repeat path. HTTP tests use production routing, middleware, JWT creation, PHP-FPM, MySQL, Redis, and Nginx. Payment transports remain offline.

### Concurrency and fault-injection facilities (`Support/`)

- `StatefulGateway.php` — the offline WeChat-pay double bound at the `Pay::class` transport seam. Its state (gateway orders, refunds, a full request log) lives in its own test tables written through a dedicated autocommit connection (`TestConnection.php`), so the application's rollbacks cannot unsend a gateway request and every process sees the same gateway. Scenarios script the awkward truths: create accepted with a lost response, payment landing before the response, refused closes, unresponsive queries, held barriers, duplicate trade numbers.
- `ConcurrencyBarrier.php` — MySQL-backed one-way gates and rendezvous points, so a request can be held at a chosen stage and released on purpose. No sleeps.
- `BusinessSnapshot.php` — read-only readers for orders, cart infos, all four stock ledgers, coupons, attempts, effects, refunds, flows, groups, virtual cards and exception payments.
- `BusinessDriver.php` + `race-worker.php` — drive the real controller entries (pay, admin refund) and the shared cancellation entry in separate processes, released together through `WorkerProcess.php`.
- `FixtureFactory.php` — unique-prefix fixtures with per-row cleanup; `TestTokenFactory.php`/`AdminTokenFactory.php` mint real JWTs.

The facilities exist only in the test stack: the gateway/barrier tables carry the `regression_` prefix, nothing in `crmeb/` reads them, and no production endpoint can trigger any of it.

### Deployment-rule suites (`tests/deployment/`)

These do not run inside the PHPUnit container: they exercise the release and
upgrade rules against real infrastructure.

- `publish-release.sh` — starts a throwaway registry and proves the publish rules
  in `scripts/publish-release.sh`: a first publish creates the tags, republishing
  the same commit is a no-op, a conflicting candidate fails and names both
  digests, an unanswerable registry query aborts instead of being read as
  "absent", and promotion only moves the deployment tag to a published candidate
  of the same commit.
- `upgrade-rollback.sh` — starts a disposable production-shaped stack seeded from
  the install SQL and proves `deploy/production/upgrade.sh`: a moving tag is
  refused, a dry run touches nothing, a failing migration keeps maintenance mode,
  a truncated or unrestorable backup stops before any migration, the successful
  path backs up, restores and verifies the backup, and `rollback.sh` refuses an
  unavailable target.

Both are part of `scripts/check-maintenance.sh`.

### Where the results are recorded

- `risk-matrix.md` — every retained business entry with its evidence and verdict.
- `cases.md` — the executable cases, including this round's defects and
  independent invariants.
- `defects.md` — each defect with its pre-fix failure, the fix commit and the
  passing case.
- `../docs/release-readiness.md` — the release record for the final commit:
  identifiers, gate results, defect-to-test mapping and the open acceptance items.
