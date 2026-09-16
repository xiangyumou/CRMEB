# Core regression suite

Run the isolated PHP 7.4, MySQL 8 and Redis 5 suite from the repository root:

```sh
sh docker/run-regression.sh
```

The command creates disposable containers and volumes. It never uses the production environment or data directories. JUnit output is written to `tests/regression/artifacts/junit.xml`.

The gate includes historic balance/recharge tests for shared financial and database behavior. These tests do not reopen retired storefront routes or allow balance payment; CoreStoreBoundaryTest checks that those requests are rejected. The Docker network is internal, so gateway, SMS, logistics, and WeChat services cannot reach the public internet during a run.

A checked item in `cases.md` must have executable assertions for the response, persisted effects, and a no-side-effect failure or repeat path. HTTP tests use production routing, middleware, JWT creation, PHP-FPM, MySQL, Redis, and Nginx. Payment transports remain offline.
