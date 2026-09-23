# CR-1-i — a `storefront-e2e` job in `.github/workflows/next.yml`

- **Stream:** I (storefront e2e), raised against the owner of `.github/workflows/next.yml`
  (the orchestrator applies it at merge time; stream I does not edit the workflow)
- **Status:** **RESOLVED** — applied by the orchestrator at I's merge (job after `e2e-admin`, `template/uni-app/**` in both path filters; not a required check yet)
- **Affects:** `.github/workflows/next.yml` (one new job, and two lines in the `paths` filters)

## What

`pnpm --filter @shop/e2e-storefront test` is the storefront's end-to-end gate. Its `webServer`
(`next/e2e/storefront/scripts/serve.ts`) starts PostgreSQL 17 and Redis 7 through Testcontainers.
It then starts the fake WeChat Pay gateway, seeds, builds the H5 bundle when `dist/dev/h5` is stale
(always, on a fresh checkout), runs `next build` when `web` has no `BUILD_ID` (always, on a fresh
checkout), and starts `next start`, the worker and the edge. So the job needs only what `e2e-admin`
needs, plus `npm ci` in `template/uni-app` for the H5 build.

On failure it uploads the Playwright traces. It **always** uploads the HTML report: every journey
attaches `console-errors.txt` and `failed-requests.txt` (the `consoleErrors` / `failedRequests`
fixtures in `next/e2e/storefront/src/fixtures.ts`), so the per-journey console-error log is there
on a green run too.

## The YAML

Add under `jobs:`, after `e2e-admin` (the block is shown under its `jobs:` key so the indentation is exact). The workflow's `defaults.run.working-directory: next`
applies, except where a step overrides it.

```yaml
jobs:
  # … existing jobs …

  storefront-e2e:
    name: storefront e2e (playwright, H5)
    runs-on: ubuntu-latest
    # Cold: image pulls, `npm ci`, the H5 build, `next build`, then the
    # journeys (~45-50 s locally, stack ready in ~5 s). Room for the one retry.
    timeout-minutes: 40
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

      # The H5 bundle the edge serves is built from the real uni-app tree by
      # the suite's own webServer (`src/h5.ts` runs `npm run build:h5`); it
      # needs that tree's own dependencies, which are npm, not pnpm.
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: template/uni-app/package-lock.json

      - name: Install the uni-app dependencies
        working-directory: template/uni-app
        run: npm ci

      # Chromium only, mobile emulation: the journeys assert what a shopper on
      # a phone browser sees, not cross-browser rendering.
      - name: Install the browser
        run: corepack pnpm --filter @shop/e2e-storefront exec playwright install --with-deps chromium

      - name: Pre-pull the service images
        run: |
          docker pull postgres:17-alpine
          docker pull redis:7-alpine

      # `CI` is set by Actions, so the config forbids `.only`, retries once,
      # and never reuses a running server. Journeys blocked on another
      # stream's open CR are `fixme` (skipped, listed with the CR id), not
      # failures. See docs/rewrite/status/i.md.
      - name: Storefront e2e
        run: corepack pnpm --filter @shop/e2e-storefront test

      # Every journey's console-errors.txt / failed-requests.txt, green or not.
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: storefront-playwright-report
          path: next/e2e/storefront/playwright-report
          retention-days: 14

      # Traces and screenshots (`retain-on-failure`).
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: storefront-test-results
          path: next/e2e/storefront/test-results
          retention-days: 14
```

And add the uni-app tree to both `paths` filters at the top of the workflow. A change to the
storefront's own source must run the journeys that drive it:

```yaml
on:
  push:
    branches: [master, "rewrite/**"]
    paths:
      - "next/**"
      - "deploy/next/**"
      - "template/uni-app/**"
      - ".github/workflows/next.yml"
  pull_request:
    paths:
      - "next/**"
      - "deploy/next/**"
      - "template/uni-app/**"
      - ".github/workflows/next.yml"
```

A push that only touches `template/uni-app/**` then also runs `static`, `integration` and
`e2e-admin`. That is wasted but harmless. If it matters, move the storefront job into a workflow
of its own with the narrower filter (`next/**`, `template/uni-app/**`) instead.

## Notes for whoever applies it

- **Not a required check at first.** Make it required once the fixme list is short. Until then
  the job proves the green journeys stay green, and the skipped list shows what is open.
- **Memory.** Measured locally (status/i.md): peak ≈ 2.8–3.0 GB summed RSS for the process tree (Chromium,
  `next start`, worker, Playwright, tsx) plus ≈ 0.11 GB in the two containers. That is inside a
  hosted `ubuntu-latest` runner (16 GB) with plenty to spare. The `next build` and H5 build
  phases run before the journeys, one after the other, not beside them.
- **No secrets.** Nothing in the job talks to WeChat, SMS or Aliyun. The fake gateway is the
  only payment endpoint, and `SHOP_FAKE_SMS=1` is set by the harness on the web process.
- **Root `pnpm test`.** The package's script is named `test`, so a root `turbo run test` would
  pick it up. `next.yml`'s `static` job runs `test:unit`, so nothing changes there. Do not add a
  root `test` pipeline that fans out to every package without excluding this one.
