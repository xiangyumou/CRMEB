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
