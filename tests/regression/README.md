# Core regression suite

Run the isolated PHP 7.4, MySQL 8 and Redis 5 suite from the repository root:

```sh
sh docker/run-regression.sh
```

The command creates disposable containers and volumes. It never uses the production environment or data directories. JUnit output is written to `tests/regression/artifacts/junit.xml`.

The initial gate covers payment and recharge idempotency, balance payment, refund crediting, integral pricing, authentication headers, unpaid cancellation, and atomic inventory deductions. Expand the suite according to `cases.md`; a checked item must have executable assertions for both the response and persisted effects.
