# CR-4-k — three CI jobs: guards, the 50-round concurrency soak, admin e2e

**Status (R5 sweep, 2026-09-23): RESOLVED** — `next.yml` has the Guards step and the concurrency-soak and e2e-admin jobs (J3, `d88065849`). The status line below is kept as history.

**Stream:** K (hardening) **Status:** OPEN — needs the orchestrator (`.github/**` is not a stream path)
**Files:** `.github/workflows/next.yml`

K owns `next/guards` and `next/e2e/admin` but may not edit CI, so the three
jobs that run them are here as ready-to-paste YAML.

## 1. `pnpm guards`, in the existing `static` job

One step, after `Lint`, before `Unit tests`. `pnpm guards` is already a turbo
task that depends on `gen`, and the run takes ~10s with turbo's cache warm.

```yaml
      - name: Guards
        run: corepack pnpm guards
```

It exits non-zero on a `fail` and zero on `pending`, so it can go in now,
while D, E1, E2, F2, I, J and S are still in flight. When the last stream
merges, the *second* hardening pass turns the pending level fatal; no CI change
is needed for that — the same command starts failing, which is the point.

Optional, worth it for PR annotations:

```yaml
      - name: Guards (JSON for annotations)
        if: failure()
        run: corepack pnpm --filter @shop/guards guards --json > guards.json
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: guards, path: next/guards.json }
```

## 2. The 50-round concurrency soak (STAB-001)

`STAB-001` asks that the concurrency suite hold over repeated runs, not once.
The races these tests cover — the last unit of stock, two refund approvals, a
callback meeting the reconciliation sweep — are decided by the database, so a
single green run proves the statement is right; fifty prove the *test* is right,
and catch the one that passes because two transactions happened not to overlap.

A separate job, not part of the merge gate: it is ~50× the integration suite and
belongs on a schedule and on demand.

```yaml
  concurrency-soak:
    name: concurrency soak (50 rounds)
    # Nightly and on demand — never on a pull request: this is a flake hunt,
    # not a gate, and a gate that takes 40 minutes stops being read.
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v5
      - name: Enable corepack
        run: corepack enable
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: next/pnpm-lock.yaml
      - name: Install
        run: corepack pnpm install --frozen-lockfile
      - name: Generate aggregates
        run: corepack pnpm gen
      - name: Pre-pull the service images
        run: |
          docker pull postgres:17-alpine
          docker pull redis:7-alpine

      # One container set, fifty rounds, a different ordering seed each time.
      # Every round that fails is recorded and the loop continues: "round 37
      # failed" is a fact about the schedule, and stopping at the first failure
      # throws away the distribution, which is the thing worth knowing.
      - name: 50 rounds
        run: |
          set -uo pipefail
          mkdir -p soak
          failed=0
          for round in $(seq 1 50); do
            echo "::group::round $round"
            if ! corepack pnpm exec vitest run --project int \
                 --sequence.seed="$round" --sequence.shuffle \
                 'packages/core/src/**/*.concurrency.int.test.ts' \
                 > "soak/round-$round.log" 2>&1; then
              failed=$((failed + 1))
              echo "round $round FAILED" | tee -a soak/failures.txt
              tail -80 "soak/round-$round.log"
            fi
            echo "::endgroup::"
          done
          echo "$failed of 50 rounds failed"
          test "$failed" -eq 0
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: soak-logs, path: next/soak }
```

and, on the workflow:

```yaml
on:
  schedule:
    - cron: '0 18 * * *' # 02:00 CST, after the day's merges
```

The suite it runs is the eight `*.concurrency.int.test.ts` files (order,
refund, payment, coupon, catalog and the order fulfilment race). Each one
already creates its own isolated schema, so the rounds do not interfere.

Two things this job must **not** do, from `K-hardening.md` §4: it never talks to
a real WeChat, SMS or Aliyun endpoint (the integration suite's gateways are
fakes, and a soak that called a sandbox 50 times a night would get the account
throttled), and it never runs against anything but a Testcontainers database.

## 3. Admin e2e

```yaml
  e2e-admin:
    name: admin e2e (playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v5
      - name: Enable corepack
        run: corepack enable
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: next/pnpm-lock.yaml
      - name: Install
        run: corepack pnpm install --frozen-lockfile
      - name: Install the browser
        run: corepack pnpm --filter @shop/e2e-admin exec playwright install --with-deps chromium
      - name: Pre-pull the service images
        run: |
          docker pull postgres:17-alpine
          docker pull redis:7-alpine
      - name: Admin e2e
        run: corepack pnpm --filter @shop/e2e-admin e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: next/e2e/admin/playwright-report
```

There is no separate `pnpm gen` step and no `next build` step: the suite's
`webServer` is `e2e/admin/scripts/serve.ts`, which runs `pnpm gen`, brings up
the containers, seeds, builds the app if `.next/BUILD_ID` is missing, and only
then starts the server. That is deliberate — the stack has to come up *inside*
the command, because Playwright starts `webServer` before `globalSetup`, so a
globalSetup that created the database would create it after the server had
already failed to connect.

The script name is `e2e`, not `test`, so that `pnpm test` at the workspace root
keeps meaning "the unit and integration suites" and does not try to launch a
browser.

Chromium only: these are assertions about the admin's own behaviour — an
authorisation boundary, an audit row, a masked secret — not about browser
compatibility. A second engine would double the runtime and assert nothing new.

**One thing the orchestrator must do before this job can pass:** the branch does
not commit `next/pnpm-lock.yaml` (per the brief), so the lockfile on the
integration branch does not yet contain `@playwright/test`. `pnpm install
--frozen-lockfile` will fail until the lockfile is regenerated on merge. The
same applies to the `static` job, because `@shop/e2e-admin` joins the root
`typecheck` and `lint` tasks.

No spec is `test.fixme`. Every one of the ten flows `K-hardening.md` §3 lists
belongs to a stream that has already merged (A, B1, B2, C, F1, G1–G3), so they
are all real assertions. The flows that *are* blocked on an unmerged stream —
storefront auth, notifications, group-buy, shipping templates — have no spec at
all yet, and are listed in `e2e/admin/README.md` and `status/k.md` as K2 work.
