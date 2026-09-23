# `@shop/guards`

Static assertions about the whole tree, run as one command:

```sh
pnpm guards                                   # from next/ — every check
pnpm --filter @shop/guards guards --quiet     # only the summary and the failures
pnpm --filter @shop/guards guards contracts permissions   # one or more by name
pnpm --filter @shop/guards guards --json      # for CI annotations
```

It exits non-zero if anything **fails**, and zero otherwise. `pnpm guards` is a
turbo task, so it runs `gen` first — the checks read the generated route
registry, not the filesystem's idea of it — and it passes no arguments through;
use the `--filter` form for flags.

## Why a package and not a lint rule

Lint sees one file at a time. Every property here is about _two_ things
agreeing — a contract and a directory, a permission atom and a menu entry, a
storefront call and a route, a business rule and the test that proves it, the
release workflow and the script it calls.

## Two verdicts

| level  | meaning               | fatal |
| ------ | --------------------- | ----- |
| `fail` | broken now            | yes   |
| `note` | context worth reading | no    |

There is no "known, fix later" level. A property that is allowed to be false
somewhere is an entry in an allow-list inside the check, with the reason next
to it (below). The last line is the count:

```
13 checks, 0 failure(s)
```

## The checks

| name            | asserts                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `domains`       | every domain in `domains.gen.ts` is imported by name, so its registrations really run                                           |
| `contracts`     | contract ⇄ route file, both ways, and the folder's `[param]` is the contract's `:param` (ROUTE-001)                             |
| `route-hygiene` | `dynamic = 'force-dynamic'` everywhere; `ctx.audit(target)` on every admin write                                                |
| `permissions`   | every route and menu atom is declared; every declared atom is used                                                              |
| `admin-client`  | no hand-built `/admin-api/…` URL and no raw `fetch()` outside the api seam                                                      |
| `uniapp`        | every storefront call resolves; every page and local import exists for H5 and MP-WEIXIN; the DIY registry matches the contracts |
| `retired`       | no feature the shop does not have comes back as an identifier or a URL token (CORE-002)                                         |
| `banned`        | no `eval`, `new Function`, `child_process`, `dangerouslySetInnerHTML`; the core clock lint rule is still an error               |
| `secrets`       | no secret config field can leave through a response schema                                                                      |
| `tx-pool`       | no `ctx.config.get(` / `ctx.db` / `ctx.withTx(` inside a function that takes a `tx`, `Tx` or `DbOrTx` (STAB-001)                |
| `migrations`    | every destructive statement in `packages/db/migrations` carries `-- destructive: approved` (OPS-007)                            |
| `pipeline`      | `next.yml` publishes through `publish-release.sh`, never promotes, and keeps its guards, soak and admin e2e gates (REL-*)       |
| `invariants`    | every rule in `docs/invariants.md` cites a test that exists, and every rule a test title names exists                           |

## The allow-lists

Every list here is **exactly compared**: an entry that stops applying is a
failure telling you to delete it. That is the whole difference between a
baseline and a hiding place.

- `checks/route-hygiene.ts` — `AUDIT_EXEMPT`: admin writes with no audit
  target — the login (every outcome is audited under `auth.adminLogin`), the
  POST-shaped `sku-matrix` read and the two inbox "mark read" routes. An entry
  fails when its URL stops being an admin write **or** its route file starts
  calling `ctx.audit(target)`.
- `checks/contracts.ts` — `UNCONTRACTED`: the one route file with no contract,
  the notification SSE stream (`defineRoute` cannot describe an event stream).
  Since it bypasses `handle()`, the check also asserts the file resolves the
  admin session itself.
- `checks/admin-client.ts` — `HAND_BUILT`: the matching client end, the bell's
  `EventSource`. Fails if the URL ever grows a contract.
- `checks/uniapp.ts` — `NOT_RENDERED_BY_PAGE`: DIY components the editor saves
  that the page renderer does not draw (`bottomMenu`, drawn by the product
  page's footer).
- `checks/retired.ts` — `ALLOWED` and `DENY_LISTS`: the files that name a
  retired feature in order to refuse it.
- `checks/banned.ts` — `FETCH_ALLOW` (one file per entry, with the host it
  builds; `fetch(` and `globalThis.fetch(` both count as a call) and the
  sanitised renderers.
- `checks/tx-pool.ts` — `TX_POOL_ALLOW`: reads proven harmless (empty). Keyed
  on the trimmed source line, so editing an excused line makes it a finding
  again.

## Tests

`pnpm --filter @shop/guards test:unit` covers the readers (uni-app sources,
test titles, the catalogue, transaction scanning, migrations, the workflow)
against small strings, and runs two checks over the real tree as tests:
`checks/contracts.test.ts` (ROUTE-001) and `checks/retired.test.ts` (CORE-002).

## Mutations

`pnpm --filter @shop/guards mutations` applies each of the ten mutations in
`scripts/mutations/mutations.ts` to a temporary copy of the tree and expects the
tests that guard it to fail (MUT-001). It runs integration tests, so it needs
Docker, and it runs nightly rather than in `pnpm guards`; `src/mutations.test.ts` keeps its
catalogue honest on every commit.
