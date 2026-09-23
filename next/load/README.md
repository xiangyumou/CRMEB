# `next/load` — the K2 §4 load smoke

One command, from `next/`:

```
pnpm --filter @shop/e2e-admin exec tsx ../../load/run.ts
```

It starts PostgreSQL 17 and Redis 7 (`docker run`, compose's memory limits,
swap off, `pg_stat_statements` on). It builds the schema with `@shop/testing`,
seeds a storefront and starts the fake WeChat Pay gateway. It runs the web
standalone server and the worker in `systemd-run --user --scope` cgroups
(512M / 320M, swap off). Then it signs 16 shoppers in, smoke-tests every flow,
waits while the 1-minute load average is above 12, warms up for 15 s and
measures for 60 s. It tears everything down at the end, including on failure
or Ctrl-C. Results go to `$TMPDIR/k2-load/<timestamp>/` (`result.json`,
`tables.md`, `web.log`, `worker.log`), never into the repository.
`REPORT.md` is the write-up of the 2026-09-23 run.

Prerequisites: Docker, `systemd-run --user` with the memory controller
delegated (true on this WSL2 box), and both builds present. Build them with
`pnpm turbo run build --filter @shop/web --filter @shop/worker`. The script
refuses to start without them and never rebuilds, because other executors
share `apps/web/.next`.

| Variable               | Default | What                                          |
| ---------------------- | ------: | --------------------------------------------- |
| `K2_LOAD_VUS`          |      16 | virtual users (one shopper each)              |
| `K2_LOAD_SECONDS`      |      60 | measured window                               |
| `K2_LOAD_WARMUP`       |      15 | warm-up before it                             |
| `K2_LOAD_MAX_LOADAVG`  |      12 | wait while the 1-min load average is above it |
| `K2_LOAD_MAX_WAIT_MIN` |      30 | …for at most this long, then run anyway       |
| `K2_LOAD_PORT`         |    3471 | web port (127.0.0.1)                          |
| `K2_LOAD_PG_PORT`      |   55471 | PostgreSQL port (127.0.0.1)                   |
| `K2_LOAD_REDIS_PORT`   |   56471 | Redis port (127.0.0.1)                        |
| `K2_LOAD_LOG_LEVEL`    |    warn | web and worker log level                      |

This directory is **not a workspace package**, because adding one would mean
a lockfile edit. `lib/deps.ts` resolves `@shop/*`, `pg` and `drizzle-orm` as
if imported from `@shop/e2e-admin`, and the script runs through that
package's `tsx`. For the same reason, `turbo run typecheck lint` does not
cover it.
