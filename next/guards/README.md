# `@shop/guards`

Static assertions about the whole tree, run as one command:

```sh
pnpm guards            # from next/ — every check
pnpm guards --quiet    # only the summary and the failures
```

From inside this package you can pick checks and formats:

```sh
pnpm --filter @shop/guards guards contracts permissions   # one or more by name
pnpm --filter @shop/guards guards --json                  # for CI annotations
```

It exits non-zero if anything **fails**, and zero otherwise. `pnpm guards` is
also a turbo task, so it runs `gen` first: the checks read the generated route
registry, not the filesystem's idea of it.

## Why a package and not a lint rule

Lint sees one file at a time. Every property here is about _two_ things
agreeing — a contract and a directory, a permission atom and a menu entry, a
`CONTRACT-PENDING` marker and a route that now exists, a ledger row and a test
that exists. The legacy tree asserted the same class of property with
`tests/static/*.cjs`; this is the successor, with the same
"baselines may only shrink" discipline.

## Three levels

| level     | meaning                                                    | fatal |
| --------- | ---------------------------------------------------------- | ----- |
| `fail`    | broken now                                                 | yes   |
| `pending` | owed by a stream that has not merged, named in the finding | no    |
| `note`    | a count worth printing                                     | no    |

`pending` is what lets the guards run during the rewrite instead of after it:
a finding owned by a stream still in flight is printed with the owner and does
not fail the build. Which streams are in flight is `lib/streams.ts`, kept in
step with `docs/rewrite/STATUS.md` by the orchestrator.

The CLI settles every pending finding against that table before it counts
anything: a pending finding whose stream is `merged` is printed as a **failure**
("owed by K, which has merged"), whichever check produced it. So the final
all-merged run is strict by itself — flip the last streams in `streams.ts` and
anything still owed fails; nothing needs to be re-enabled.

The last line names what is still owed, by stream:

```
10 checks, 0 failure(s), 51 pending (H3=37, I=9, K=5); in flight: H3, I, K
```

## The checks

| name            | asserts                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `domains`       | every domain in `domains.gen.ts` is really installed (CR-1-k)                                                     |
| `contracts`     | contract ⇄ route file, both ways, and the folder's `[param]` is the contract's `:param`                           |
| `route-hygiene` | `dynamic = 'force-dynamic'` everywhere; `ctx.audit(target)` on every admin write                                  |
| `permissions`   | every route and menu atom is declared; every declared atom is used                                                |
| `admin-client`  | no hand-built `/admin-api/…` URL and no raw `fetch()` outside the api seam                                        |
| `uniapp`        | every storefront call resolves, and no `CONTRACT-PENDING` marker outlives its route                               |
| `retired`       | no retired feature comes back as an identifier or a URL token                                                     |
| `banned`        | no `eval`, `new Function`, `child_process`, `dangerouslySetInnerHTML`; the core clock lint rule is still an error |
| `secrets`       | no secret config field can leave through a response schema                                                        |
| `tx-pool`       | no `ctx.config.get(` / `ctx.db` / `ctx.withTx(` inside a function that takes a `tx`, `Tx` or `DbOrTx` (CR-53-k2)  |
| `invariants`    | `cases.md` ⇄ `invariants.md` ⇄ `risk-matrix.md`, and every named test exists                                      |

## The allow-lists

Every list here is **exactly compared**: an entry that stops applying is a
failure telling you to delete it. That is the whole difference between a
baseline and a hiding place.

- `checks/route-hygiene.ts` — `AUDIT_EXEMPT`: admin writes with no audit
  target. Four decisions (login, the POST-shaped `sku-matrix` read, the two
  inbox "mark read" routes) and one defect, `scan-tokens` (CR-5-k, now
  CR-30-k2, owed at K2's merge). An entry fails when its URL stops being an
  admin write **or** its route file starts calling `ctx.audit(target)`.
- `checks/contracts.ts` — `UNCONTRACTED`: the one route file with no contract,
  the notification SSE stream. A decision (`defineRoute` cannot describe an
  event stream); since it bypasses `handle()`, the guard also asserts the file
  resolves the admin session itself.
- `checks/admin-client.ts` — `HAND_BUILT`: the matching client end, the bell's
  `EventSource`. Fails if the URL ever grows a contract.
- `checks/retired.ts` — `ALLOWED` and `DENY_LISTS`: the files that name a
  retired feature in order to refuse it.
- `checks/banned.ts` — `FETCH_ALLOW` (one file per entry, with the host it
  builds; `fetch(` and `globalThis.fetch(` both count as a call) and the
  sanitised renderers.
- `checks/tx-pool.ts` — `TX_POOL_ALLOW` (reads proven harmless; empty) and
  `TX_POOL_OWED` (known instances, `pending` on the stream that owns the file:
  the checkout config read, the freight quote and `autoDeliver`, CR-1-r1).
  Keyed on the trimmed source line, so editing an excused line makes it a
  finding again.
- `lib/marker-reassignments.ts` — `CONTRACT-PENDING` markers whose owner moved
  to a stream still in flight (H3).
- `lib/pending-edits.ts` — the `invariants.md` rows CR-2-k asks the
  orchestrator to write, each with the stream whose merge carries it.

`lib/pending-implementations.ts` (contracts merged ahead of their routes) is
gone: D2, F3 and E3 merged and it was empty. A contract with no route file is a
failure again, as it always should have been.

## Tests

`pnpm --filter @shop/guards test:unit` covers the parsers and the marker
algebra directly, and runs two checks as tests — `checks/contracts.test.ts`
(ROUTE-001) and `checks/retired.test.ts` (CORE-002) — because
`docs/rewrite/invariants.md` points those two legacy cases at this package.
